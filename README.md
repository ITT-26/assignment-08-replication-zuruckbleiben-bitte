# Visual TwinPads

Visual TwinPads is my replication of the virtual keyboard from *Visual
Touchpad: A Two-handed Gestural Input Device* by Shahzad Malik and Joe Laszlo
(ICMI 2004).

- [Paper](https://www.dgp.toronto.edu/~jflaszlo/papers/icmi-pui-2004/malik_2004_ICMI_visual_touchpad.pdf)
- [DOI](https://doi.org/10.1145/1027933.1027980)

This is an individual submission. The assignment normally uses groups of two,
but the lecturer allowed me to complete it alone.

The paper uses two cameras to track several fingertips above one flat surface.
Stereo disparity detects contact. My prototype instead uses one camera for
fingertip positions and two Apple trackpads for contact events. I only replicate
the paper's two-handed virtual keyboard.

## Paper choice

I compared several papers with my hardware and the two-week time limit. I ruled
out ideas that needed extra hardware. A camera-based mouse was possible, but too
close to a normal mouse. I chose Visual Touchpad because I had a MacBook, a
Magic Trackpad and an iPhone camera. It also gave me a clear two-handed demo.

## Implementation

The program works as follows:

1. I click the four corners of each trackpad in the camera image.
2. OpenCV calculates a homography for each pad.
3. MediaPipe detects index fingertips, while macOS reports trackpad contacts.
4. The app matches both inputs by timestamp.
5. It takes the median position of each tap and checks the keyboard regions.
6. It shows one text result from the trackpads and one from the camera.

Green crosses show trackpad contacts. Red circles show camera positions. The two
text lines make camera errors visible during the demo.

The optional layout editor creates a full ISO-DE main block or a reduced QWERTZ
A-Z layout. It exports a JSON file for the app and printable SVG or PNG files.
The included default is the full ISO-DE layout with macOS labels.

In typing mode, the app updates both text lines. With an explicit startup flag,
`P` can also send the physical result to the focused macOS application. Command,
Option and Control are disabled.

I also included a `$1` gesture recognizer from my Assignment 6. It learns one
example of five gestures and classifies physical strokes from either trackpad.
This optional extension is not part of the replication or evaluation.

## Comparison with the paper

| Paper | My prototype |
| --- | --- |
| Two cameras and stereo disparity | One camera and trackpad contact events |
| One black rectangular surface | Two separate Apple trackpads |
| Several fingers, postures and gestures | One index finger on each pad |
| Transparent QWERTY keyboard and video hands | QWERTZ overlay and point markers |
| Image, canvas and menu interactions | Virtual keyboard only |

Both systems use four-corner homographies, fixed keyboard regions and
two-handed typing while looking at the screen.

## Requirements and setup

Hardware:

- a MacBook with a built-in trackpad
- one Apple Magic Trackpad
- an overhead camera, such as an iPhone Continuity Camera
- a fixed mount with both trackpads visible

Software:

- macOS and Python 3.12
- Node.js 24 and pnpm 11 for the optional layout editor

From the project root, create the Python environment:

```bash
python3.12 -m venv visual-twinpads/.venv
visual-twinpads/.venv/bin/python -m pip install \
  -r visual-twinpads/requirements.txt
```

The required MediaPipe model is already included at
`visual-twinpads/models/hand_landmarker.task`.

To run the optional layout editor:

```bash
cd keyboard-overlay-generator
pnpm install
pnpm dev
```

## Usage

From the project root, start the app with the included keyboard layout:

```bash
visual-twinpads/.venv/bin/python -m visual-twinpads \
  --camera 0 \
  --enable-macos-passthrough
```

This flag allows `P` to switch output to another macOS application on or off.

Camera rotation, delay and a custom layout can also be set:

```bash
visual-twinpads/.venv/bin/python -m visual-twinpads \
  --camera 1 \
  --camera-rotation 180 \
  --camera-lag-ms 150 \
  --keyboard-layout /path/to/visual-twinpads-keyboard.json
```

Controls:

1. Press `C`.
2. Click the built-in trackpad corners in TL, TR, BR, BL order. Repeat this for
   the Magic Trackpad.
3. Press Enter to accept the calibration.
4. Press `T`, then tap a short word on the virtual keyboard.
5. If output was allowed at startup, press `P` to toggle it. Press `G` to learn
   the five optional gesture templates shown by the app. Templates use the
   built-in trackpad; learned gestures work on either pad.
6. Press Esc to close the app.

Passthrough needs Accessibility permission for the terminal or Python process.
Grant it under **System Settings > Privacy & Security > Accessibility**, then
focus the application that should receive the text.

If taps are matched with the wrong camera frames, adjust `--camera-lag-ms`.

## Main files

- `visual-twinpads/app.py`: main window and controls
- `visual-twinpads/calibration.py`: homographies
- `visual-twinpads/hand_tracking.py`: fingertip detection
- `visual-twinpads/touchpads.py`: macOS trackpad events
- `visual-twinpads/tasks.py`: touch and camera matching
- `visual-twinpads/keyboard.py`: keyboard loading and drawing
- `visual-twinpads/macos_injection.py`: optional macOS output
- `visual-twinpads/recognizer.py`: reused `$1` recognizer
- `keyboard-overlay-generator`: React layout editor

## Limitations and evaluation

My single-camera setup does not detect contact reliably, so I use trackpad
events instead. This makes the prototype usable but changes the paper's
vision-only interaction.

Continuity Camera is delayed compared with trackpad events.
`--camera-lag-ms` shifts the camera window used for each tap. MediaPipe can lose
a fingertip because of lighting, occlusion or motion blur. The app also supports
only one contact per pad and uses the undocumented `MultitouchSupport` macOS
framework.

The paper reports no controlled study. Lab students tried the system for 10 to
15 minutes. They liked seeing their hands, but found the keyboard awkward and
error-prone without tactile feedback or clear key boundaries. Camera capture
and processing also limited typing speed. My trackpads add physical surfaces
and contact events, but make the interaction less faithful to the paper.

Passthrough uses only the physical result; the camera result stays visible for
comparison. The optional gesture mode also uses only physical paths and does
not reproduce the paper's gestures.

## External code and models

The contact declarations in `visual-twinpads/touchpads.py` are adapted from
Kivy's MIT-licensed
[macOS touch provider](https://kivy.org/doc/stable-1.11.0/_modules/kivy/input/providers/mactouch.html).
I checked additional private-framework signatures against this
[MultitouchSupport reference](https://gist.github.com/rmhsilva/61cc45587ed34707da34818a76476e11).

The included model is the
[MediaPipe Hand Landmarker](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task).
The editor uses generated [shadcn/ui](https://ui.shadcn.com/) components. The
`$1` implementation in `visual-twinpads/recognizer.py` is my own code from
Assignment 6.

The keyboard overlay editor's UI was created largely with generative AI
assistance. I designed its architecture, chose the frameworks, reviewed the
generated code and refactored it before including it in this project.

## Demo and presentation

The 30 to 60 second demo shows the hardware, calibration and two-handed typing,
including both text results. In the live demo, I explain the paper, my choices,
the differences and the limitations.
