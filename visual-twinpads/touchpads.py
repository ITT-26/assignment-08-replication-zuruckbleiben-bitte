"""Native macOS trackpad input isolated behind a small provider interface.

The ``_MTPoint``, ``_MTVector``, ``_MTData`` and callback declarations below
are adapted from Kivy 1.11.0's ``kivy/input/providers/mactouch.py``:
https://kivy.org/doc/stable-1.11.0/_modules/kivy/input/providers/mactouch.html

Kivy - Copyright 2010-2018, The Kivy Authors.  Used under the MIT License:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Additional private-framework signatures were checked against the collected
MultitouchSupport notes at
https://gist.github.com/rmhsilva/61cc45587ed34707da34818a76476e11.
"""

from __future__ import annotations

import ctypes
import queue
import sys
import time
from typing import Protocol

from .data import Contact, PadRole, TouchFrame


MULTITOUCH_FRAMEWORK = (
    "/System/Library/PrivateFrameworks/"
    "MultitouchSupport.framework/MultitouchSupport"
)
COREFOUNDATION_FRAMEWORK = (
    "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
)


class TouchProvider(Protocol):
    """Minimal source of complete, timestamped touch frames."""

    def start(self) -> None:
        """Start producing frames."""

    def poll(self, timeout: float = 0.0) -> TouchFrame | None:
        """Return the next frame, or ``None`` if none is available."""

    def stop(self) -> None:
        """Stop producing frames and release platform resources."""


class _MTPoint(ctypes.Structure):
    _fields_ = [("x", ctypes.c_float), ("y", ctypes.c_float)]


class _MTVector(ctypes.Structure):
    _fields_ = [("position", _MTPoint), ("velocity", _MTPoint)]


class _MTData(ctypes.Structure):
    """Contact layout documented by Kivy's macOS touch provider."""

    _fields_ = [
        ("frame", ctypes.c_int),
        ("timestamp", ctypes.c_double),
        ("identifier", ctypes.c_int),
        ("state", ctypes.c_int),
        ("unknown1", ctypes.c_int),
        ("unknown2", ctypes.c_int),
        ("normalized", _MTVector),
        ("size", ctypes.c_float),
        ("unknown3", ctypes.c_int),
        ("angle", ctypes.c_float),
        ("major_axis", ctypes.c_float),
        ("minor_axis", ctypes.c_float),
        ("unknown4", _MTVector),
        ("unknown5_1", ctypes.c_int),
        ("unknown5_2", ctypes.c_int),
        ("unknown6", ctypes.c_float),
    ]


_MTDataPointer = ctypes.POINTER(_MTData)
_MTCallback = ctypes.CFUNCTYPE(
    ctypes.c_int,
    ctypes.c_void_p,
    _MTDataPointer,
    ctypes.c_size_t,
    ctypes.c_double,
    ctypes.c_size_t,
)


def _clamp_unit(value: float) -> float:
    return min(1.0, max(0.0, value))


def _copy_native_contacts(
    contacts_pointer: _MTDataPointer, count: int
) -> tuple[Contact, ...]:
    """Copy callback-owned memory and convert to the app's top-down axes."""

    copied: list[Contact] = []
    for index in range(count):
        native = contacts_pointer[index]
        copied.append(
            Contact(
                identifier=int(native.identifier),
                x=_clamp_unit(float(native.normalized.position.x)),
                # Convert the bottom-up trackpad axis to image coordinates.
                y=_clamp_unit(1.0 - float(native.normalized.position.y)),
            )
        )
    return tuple(copied)


class _MacBindings:
    """Configured ctypes bindings, loaded lazily on first ``start``."""

    def __init__(self) -> None:
        try:
            self.multitouch = ctypes.CDLL(MULTITOUCH_FRAMEWORK)
            self.corefoundation = ctypes.CDLL(COREFOUNDATION_FRAMEWORK)
        except OSError as error:
            raise RuntimeError(
                "Apple's private MultitouchSupport framework could not be loaded"
            ) from error

        mt = self.multitouch
        cf = self.corefoundation

        self.create_list = mt.MTDeviceCreateList
        self.create_list.argtypes = []
        self.create_list.restype = ctypes.c_void_p

        self.array_count = cf.CFArrayGetCount
        self.array_count.argtypes = [ctypes.c_void_p]
        self.array_count.restype = ctypes.c_long

        self.array_value = cf.CFArrayGetValueAtIndex
        self.array_value.argtypes = [ctypes.c_void_p, ctypes.c_long]
        self.array_value.restype = ctypes.c_void_p

        self.release = cf.CFRelease
        self.release.argtypes = [ctypes.c_void_p]
        self.release.restype = None

        self.register = mt.MTRegisterContactFrameCallback
        self.register.argtypes = [ctypes.c_void_p, _MTCallback]
        self.register.restype = None

        self.unregister = getattr(mt, "MTUnregisterContactFrameCallback", None)
        if self.unregister is not None:
            self.unregister.argtypes = [ctypes.c_void_p, _MTCallback]
            self.unregister.restype = None

        self.device_start = mt.MTDeviceStart
        self.device_start.argtypes = [ctypes.c_void_p, ctypes.c_int]
        self.device_start.restype = None

        self.device_stop = getattr(mt, "MTDeviceStop", None)
        if self.device_stop is not None:
            self.device_stop.argtypes = [ctypes.c_void_p]
            self.device_stop.restype = None

        self.is_built_in = getattr(mt, "MTDeviceIsBuiltIn", None)
        if self.is_built_in is not None:
            self.is_built_in.argtypes = [ctypes.c_void_p]
            self.is_built_in.restype = ctypes.c_bool

        # The ID is written to the second argument.
        self.get_device_id = getattr(mt, "MTDeviceGetDeviceID", None)
        if self.get_device_id is not None:
            self.get_device_id.argtypes = [
                ctypes.c_void_p,
                ctypes.POINTER(ctypes.c_uint64),
            ]
            self.get_device_id.restype = ctypes.c_int32


class MacMultitouchProvider:
    """Raw per-device contact frames from macOS MultitouchSupport.

    MultitouchSupport is an undocumented private framework.  It is suitable for
    this local prototype but must not be treated as a stable public macOS API.
    """

    def __init__(self) -> None:
        self._queue: queue.Queue[TouchFrame] = queue.Queue()
        self._bindings: _MacBindings | None = None
        self._device_list: int | None = None
        self._devices: list[int] = []
        self._callbacks: dict[int, _MTCallback] = {}
        self._device_descriptors: list[tuple[str, PadRole]] = []
        self._started = False
        self._callback_error: BaseException | None = None

    @property
    def devices(self) -> tuple[tuple[str, PadRole], ...]:
        """Enumerated ``(device_id, role)`` pairs after ``start``."""

        return tuple(self._device_descriptors)

    def start(self) -> None:
        if self._started:
            return
        if sys.platform != "darwin":
            raise RuntimeError(
                "MacMultitouchProvider is available only on macOS (darwin)"
            )

        self._clear_queue()
        self._callback_error = None
        bindings = _MacBindings()
        device_list = bindings.create_list()
        if not device_list:
            raise RuntimeError("MultitouchSupport returned no device list")

        self._bindings = bindings
        self._device_list = int(device_list)
        try:
            count = int(bindings.array_count(device_list))
            if count <= 0:
                raise RuntimeError("No multitouch trackpad devices were found")

            for index in range(count):
                device_value = bindings.array_value(device_list, index)
                if not device_value:
                    continue
                device = int(device_value)
                device_id = self._read_device_id(bindings, device, index)
                role = self._read_role(bindings, device)
                callback = self._make_callback(role)

                bindings.register(device, callback)
                bindings.device_start(device, 0)
                self._devices.append(device)
                self._callbacks[device] = callback
                self._device_descriptors.append((device_id, role))

            if not self._devices:
                raise RuntimeError("No usable multitouch trackpad devices were found")
            self._started = True
        except BaseException:
            self._cleanup_native()
            raise

    def poll(self, timeout: float = 0.0) -> TouchFrame | None:
        if not self._started:
            raise RuntimeError("MacMultitouchProvider must be started before polling")
        if timeout < 0:
            raise ValueError("timeout must be non-negative")
        if self._callback_error is not None:
            error = self._callback_error
            self._callback_error = None
            raise RuntimeError("MultitouchSupport callback failed") from error

        try:
            if timeout == 0:
                return self._queue.get_nowait()
            return self._queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def stop(self) -> None:
        self._cleanup_native()
        self._started = False

    def _make_callback(self, role: PadRole) -> _MTCallback:
        @_MTCallback
        def callback(
            _device: int | None,
            data_pointer: _MTDataPointer,
            contact_count: int,
            _native_timestamp: float,
            _frame_number: int,
        ) -> int:
            try:
                contacts = _copy_native_contacts(data_pointer, int(contact_count))
                # Use the same clock as the camera frames.
                self._queue.put_nowait(
                    TouchFrame(
                        role=role,
                        timestamp_ns=time.perf_counter_ns(),
                        contacts=contacts,
                    )
                )
            except BaseException as error:  # never unwind through a C callback
                self._callback_error = error
            return 0

        return callback

    @staticmethod
    def _read_role(bindings: _MacBindings, device: int) -> PadRole:
        if bindings.is_built_in is None:
            return "unknown"
        return "built-in" if bool(bindings.is_built_in(device)) else "external"

    @staticmethod
    def _read_device_id(
        bindings: _MacBindings, device: int, index: int
    ) -> str:
        if bindings.get_device_id is not None:
            native_id = ctypes.c_uint64()
            status = int(bindings.get_device_id(device, ctypes.byref(native_id)))
            if status == 0:
                return str(native_id.value)
        # The pointer is enough to distinguish devices during this run.
        return f"device-{index}-{device:x}"

    def _cleanup_native(self) -> None:
        bindings = self._bindings
        try:
            if bindings is not None:
                for device in reversed(self._devices):
                    callback = self._callbacks.get(device)
                    try:
                        if bindings.device_stop is not None:
                            bindings.device_stop(device)
                    except Exception:
                        pass
                    try:
                        if callback is not None and bindings.unregister is not None:
                            bindings.unregister(device, callback)
                    except Exception:
                        pass
                if self._device_list is not None:
                    try:
                        bindings.release(self._device_list)
                    except Exception:
                        pass
        finally:
            self._devices.clear()
            self._callbacks.clear()
            self._device_descriptors.clear()
            self._device_list = None
            self._bindings = None

    def _clear_queue(self) -> None:
        try:
            while True:
                self._queue.get_nowait()
        except queue.Empty:
            pass
