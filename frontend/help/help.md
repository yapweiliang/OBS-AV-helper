# Wei Liang's AV Helper

## Tips for the AV People

### ON ARRIVAL (09:00)

1. Place batteries in the charger

1. Adjust camera presets for the service
    - Lectern preset points at lectern
    - Worship leader preset points at worship leader
    - Band-right preset includes appropriate view of the band on stage
    - etc

1. Sound setup **with Worship Group**, includes:
    - load the relevent musician/singer presets on the Mixing Station app (iPad)
    - ensure their microphones are connected to the expected channels
    - STAGE ORGANISATION (and SAFETY)
        - cable tidiness
        - positions of monitor speakers
        - position of mic stands

1. Sound setup **Part 2**, includes:
    - placement of the lectern microphone
    - placement of the ambient/audience microphone

1. Test that all the controls/buttons are working as expected

1. Check that the sound is 'ok' in the cafe


### BEFORE SERVICE (10:00 - 10:30)

* Place batteries in wireless mics (handhelds + wireless headmic)
* Test the wireless mics
* Identify the preacher, and demonstrate the use of the wireless headmic
* As long as the preacher is able to 'wear' the headmic, encourage its use, as the sound will be easier to control

### JUST BEFORE THE SERVICE (10:25 - 10:30)

* Start the live stream by pressing the appropriate button

### DURING SERVICE (early)

* Listen to the YouTube stream to verify that **sound** is heard.

### DURING SERVICE

* call the required X32 sound scenes as needed (Lectern, Band-singing, Band-speaking, etc)
* call the required OBS video scenes as needed
* focus the camera as needed
* save your adjustments to camera presets as needed
* display the `OVERLAY` as needed (e.g. *"Parents collect your children..."*)    

### AFTER SERVICE

* **MUTE** the microphones
* set mics and sound presets for the next service (if known)
* shutdown the AV equipment
* shutdown the stage equipment

## Background

This application is a server running on Node, on the **OBS Computer**.  It does the following:

* on start-up
    - sends message to camera to 'wake-up'

* on windows shutdown
    - sends message to camera to 'sleep' **[WORK IN PROGRESS]**
    - sends message to OBS to shutdown

* during the session
    - provides a browser interface for the AV Person to:
        - call sound scenes (X32 snippets)
        - call OBS scenes
        - adjust Zowie camera presets
        - focus mode, set white-balance
    - listens to OBS
        - to update the camera *tally light* colour
        - to support the `OVERLAY` scene
    
## Installation

* nssm

## Issues to resolve

- [ ] to do this
- [x] to do that


