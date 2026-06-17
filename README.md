# AV Helper

### Overview

This is a node server that:

* allows our AV people to use their tablet device for basic control of our **OBS** (*websocket*), **Zowietek 4k PTZ** camera (*POST API*), and **Behringer X32** snippets/mutes (*OSC*)
* does some background support to control the Tally Light on the camera
* does some background support for the Overlay scene in OBS

#### Technical Concepts

* server.js runs as a service (using **nssm**) on the OBS PC
* slimmed-down client as a *browser dock* on OBS - camera control, provide the **login code**, etc
* client(s) connect, but require a **login code** (obtained in person from the AV desk)
* the **login code** is randomly generated and only valid for the particular day

#### Functional Concepts

* Pre-service
    * facilitates the setting of the PTZ camera presets (as the lectern, stage configuration, etc, may be different from week to week)
* During service
    * ease of control of the X32 snippets, OBS scenes
    * camera Tally Light colour to indicate live stream status
* At OBS connection
    * wake up the camera in case it has been set to standby
* At OBS shutdown
    * place the camera in standby

### Usage

* Browse to the http server with the **tablet device**
* Obtain the **login code** from the OBS browser dock
* Good to go 😅

### Installation

1. Prerequisites:
    * [Nodejs](https://nodejs.org/en/download) is installed
    * [NSSM](nssm.cc) (2.24-101-g897c7ad) is downloaded, and available in the PATH
1. Download the entire folder structure from https://github.com/yapweiliang/OBS-AV-helper
    * click the green `Code` button then `Download ZIP` button
    * save to `....\OneDrive\location_of_my\av-helper\` on the same PC that runs OBS
    * unzip the repository (and delete the zip file)
1. `cd` to `....\OneDrive\location_of_my\av-helper\`
1. `npm install`
1. `nssm install av-helper`
    * path: `C:\Program Files\nodejs\node.exe`
    * arguments: `....\OneDrive\location_of_my\av-helper\server.js`
    * startup directory: `....\OneDrive\location_of_my\av-helper`
    * TODO other arguments
1. `nssm start av-helper`
1. TODO instruction for OBS browser dock

#### Updates

#### Configuration

* the `config.js` file should be self-explanatory
* pay particular attention to the spellings in the OBS scenes, etc





