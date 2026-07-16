"""Opt-in macOS keyboard event injection for the passthrough demo."""

from __future__ import annotations

import ctypes
import sys


APPLICATION_SERVICES = (
    "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
)
COREFOUNDATION = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
KCG_HID_EVENT_TAP = 0


class MacOSKeyboardInjector:
    """Post Unicode text and a small set of editing keys through Quartz."""

    def __init__(self) -> None:
        if sys.platform != "darwin":
            raise RuntimeError("macOS keyboard injection is available only on macOS")
        self._services = ctypes.CDLL(APPLICATION_SERVICES)
        self._corefoundation = ctypes.CDLL(COREFOUNDATION)

        self._services.AXIsProcessTrusted.argtypes = []
        self._services.AXIsProcessTrusted.restype = ctypes.c_bool
        self._services.CGEventCreateKeyboardEvent.argtypes = [
            ctypes.c_void_p,
            ctypes.c_uint16,
            ctypes.c_bool,
        ]
        self._services.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
        self._services.CGEventKeyboardSetUnicodeString.argtypes = [
            ctypes.c_void_p,
            ctypes.c_ulong,
            ctypes.POINTER(ctypes.c_uint16),
        ]
        self._services.CGEventKeyboardSetUnicodeString.restype = None
        self._services.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
        self._services.CGEventPost.restype = None
        self._corefoundation.CFRelease.argtypes = [ctypes.c_void_p]
        self._corefoundation.CFRelease.restype = None

    @property
    def trusted(self) -> bool:
        return bool(self._services.AXIsProcessTrusted())

    def type_text(self, text: str) -> None:
        if not text:
            return
        self._require_trusted()
        encoded = text.encode("utf-16-le")
        units = (ctypes.c_uint16 * (len(encoded) // 2)).from_buffer_copy(encoded)
        down = self._create_event(0, True)
        up = self._create_event(0, False)
        try:
            self._services.CGEventKeyboardSetUnicodeString(down, len(units), units)
            self._services.CGEventPost(KCG_HID_EVENT_TAP, down)
            self._services.CGEventPost(KCG_HID_EVENT_TAP, up)
        finally:
            self._corefoundation.CFRelease(down)
            self._corefoundation.CFRelease(up)

    def press_keycode(self, keycode: int) -> None:
        self._require_trusted()
        down = self._create_event(keycode, True)
        up = self._create_event(keycode, False)
        try:
            self._services.CGEventPost(KCG_HID_EVENT_TAP, down)
            self._services.CGEventPost(KCG_HID_EVENT_TAP, up)
        finally:
            self._corefoundation.CFRelease(down)
            self._corefoundation.CFRelease(up)

    def _create_event(self, keycode: int, key_down: bool) -> int:
        event = self._services.CGEventCreateKeyboardEvent(None, keycode, key_down)
        if not event:
            raise RuntimeError("Quartz could not create a keyboard event")
        return int(event)

    def _require_trusted(self) -> None:
        if not self.trusted:
            raise PermissionError(
                "Accessibility permission is required for macOS keyboard passthrough"
            )
