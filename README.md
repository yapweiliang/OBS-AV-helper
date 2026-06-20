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
    * download `install.js` and run `node install.js` (with administrator priviledge) from https://raw.githubusercontent.com/yapweiliang/OBS-AV-helper/main/install.js
    * or, download and run `install.bat` from https://raw.githubusercontent.com/yapweiliang/OBS-AV-helper/main/install.bat which will do the above
    * Tip: *right-click --> save link as...* to download

1. Manual first time installation, on the PC that runs OBS
    * Download the entire folder structure from https://github.com/yapweiliang/OBS-AV-helper
    * save to `....\OneDrive\av-shared\OBS-AV-helper\`

    * `cd` to that folder
    * `npm ci`
    * Tip: *nssm needs to run with administrator priviledge*
    * `nssm install av-helper`
    * `nssm edit av-helper`
        * path: `C:\Program Files\nodejs\node.exe`
        * startup directory: `....\OneDrive\av-shared\OBS-AV-helper\\OneDrive\av-shared\av-helper`
        * arguments: `server.js`
        * stdout: `...OneDrive\av-shared\OBS AV Helper\logs\av-helper.log`
        * stderr:`...OneDrive\av-shared\OBS AV Helper\logs\av-helper.log`
        * file rotation: [y] rotate files
    * `nssm start av-helper`

1. test the installation by opening http://localhost:3000

1. Use http://localhost:3000/obs-dock as OBS Custom Browser Dock

#### Updates

1. run `node install.js` as administrator (or run `install.bat`)

1. consider whether any new settings in `config.new.js` need to be placed in existing `config.js`

1. test the installation

1. if the process fails, try again; it is possible that the server was not stopped before the update process

#### Configuration

* the `config.js` file should be self-explanatory
* pay particular attention to the spellings in the OBS scenes, etc
* server must be restarted if any changes are made.
    * `net stop av-helper` / `nssm stop av-helper` then
    * `net start av-helper` / `nssm start av-helper`





