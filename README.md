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

1. First time installation, on the PC that runs OBS
    * download `install.js` and run `node install.js` from https://raw.githubusercontent.com/yapweiliang/OBS-AV-helper/main/install.js
    * or, download and run `install.bat` from https://raw.githubusercontent.com/yapweiliang/OBS-AV-helper/main/install.bat which will do the above
    * Tip: *right-click --> save link as...* to download

1. Manual first time installation, on the PC that runs OBS
    * Download the entire folder structure from https://github.com/yapweiliang/OBS-AV-helper
    * save to `....\OneDrive\av-shared\OBS-AV-helper\`

    * `cd` to that folder
    * `npm ci`
    * `nssm install av-helper`
        * path: `C:\Program Files\nodejs\node.exe`
        * arguments: `....\OneDrive\av-shared\av-helper\server.js`
        * startup directory: `....\OneDrive\av-shared\av-helper`
        * TODO other arguments
    * `nssm start av-helper`

1. TODO instruction for OBS browser dock

#### Updates

* run `node install.js`
* then consider whether any new settings in `config.new.js` need to be placed in existing `config.js`
* TODO - UI method

#### Configuration

* the `config.js` file should be self-explanatory
* pay particular attention to the spellings in the OBS scenes, etc





