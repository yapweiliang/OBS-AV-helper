/*
    API calls to ZowiePTZ camera
    Wei Liang Yap 2026

    based on ZowieTek API v1.11 documentation

    https://github.com/bitfocus/companion-module-zowietek-api may also be useful for cross-checking
*/

// TODO consider rewrite, instead of mutating globals j_camera_set_preset__.data.id = n;
// CONSIDER clone,  const j = structuredClone(j_camera_set_preset__); j.data.id = n;

const EventEmitter = require("node:events");

const DEBUG_PREFIX = "[camera.js]";
function debugPrefix() { return `${new Date().toLocaleTimeString()} ${DEBUG_PREFIX}` };

const API_TIMEOUT_MS = 1000; // how many ms to wait before aborting POST
const DELAY_BETWEEN_POST_MS = 10; // how many ms to wait in-between multiple POSTs

const TALLY_COLOR_UNKNOWN = "black"; // return this color if set tally color fails

// ----------------------------------------------------------------------------
const SET_INFO = "setinfo";
const GET_INFO = "getinfo";
// const transmitApiOption = "transmit"; not applicable to ZowiePTZ camera
// ----------------------------------------------------------------------------

// camera JSON definitions are at the bottom of the file

// ----------------------------------------------------------------------------

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ----------------------------------------------------------------------------

class camera extends EventEmitter {

    constructor(config) {

        super();

        this.CAMERA_IP = `http://${config.CAMERA_IP}`;
        this.isDevelopment = config.isDevelopment;

        this.apiBusy = false;
        this.cameraAPIBusyCount = 0;
        this.tallySwitch = false; // assume the tally light is switched off initially
        this.lastSelectedPreset = -1;

    }

    // ====================================================
    // CONNECT (not applicable)
    // ====================================================

    // ====================================================
    // helper functions
    // ====================================================

    determinePathFromGroup(group) {
        // determines the url path from the json key "group" (reference API documentation) so we don't have to separately specify the path
        switch (group) {
            // case "fan":
            // case "get_cpu_temp":
            case "tally_led":
            case "syscontrol":
                return "system"; // tally_led, syscontrol
            case "hdmi":
                // case "digital_zoom":
                return "video"; // hdmi, digital_zoom
            /*
                    case "nas":
                        return "storage"; // nas
                    case "osd_layout":
                    case "resource":
                        return "osd"; // osd_layout, resource
                    case "publish":
                    case "set_srt_local_switch":
                    case "set_srt_local_info":
                        return "stream"; // publish, set_srt_local_switch, set_sert_local_info
                    case "client":
                    case "ptz_control":
                        return "ptzctrl"; // client, ptz_control // options: transmit, setinfo, (no getinfo)
                    case "photo":
                        return "snapshot"; // photo // options: takephoto, getinfo, (no setinfo)
            */
            default:
                return group; // ptz, camera, streamplay, patient, record
        }
    }

    // ====================================================
    // API calling
    // ====================================================

    async callAPI(jsonInput, urlOption = SET_INFO, timeoutMultiplier = 1) {
        // returns false if failed
        // returns true if SET_INFO success
        // returns data or [data array] if GET_INFO success

        if (this.apiBusy) {
            this.cameraAPIBusyCount++;
            console.warn(debugPrefix(), `Camera API busy (count=${this.cameraAPIBusyCount})`);
            return false;
        }
        this.apiBusy = true;

        const jsonList = Array.isArray(jsonInput) ? jsonInput : [jsonInput]; // convert single element to array if needed
        let valueToReturn = [];

        try {
            let l = jsonList.length;
            for (const json of jsonList) {

                const controller = new AbortController();
                const timer = setTimeout( () => controller.abort(), API_TIMEOUT_MS * timeoutMultiplier);

                try {
                    const path = this.determinePathFromGroup(json.group);
                    const url = `${this.CAMERA_IP}/${path}?option=${urlOption}&login_check_flag=1`;

                    const response = await fetch(url, {
                        method: "POST",
                        body: JSON.stringify(json),
                        headers: {"Content-type": "application/json; charset=UTF-8"},
                        signal: controller.signal
                    })
                    if (!response.ok) {
                        // returns HTTP 500 (internal server error) when camera is not yet ready
                        throw new Error(`Response status: ${response.status} from ${url}`);
                    }

                    const result = await response.json();
                    const success = result.rsp == "succeed";

                    if (!success) {
                        throw new Error(`API call failed.\n - received: ${JSON.stringify(result)}`);
                    }

                    console.log(debugPrefix(), `${url}\n - json: ${JSON.stringify(json)}\n - returned: ${JSON.stringify(result)}`);

                    if (urlOption == GET_INFO) {
                        valueToReturn.push(result);
                    } else {
                        valueToReturn = true;
                    }

                    if (l > 1) {
                        await sleep(DELAY_BETWEEN_POST_MS); // pause between multiple POSTs, but not after the last POST
                        l -= 1;
                    }

                } catch(error) {
                    if (error.name ==="AbortError") { throw new Error(`Camera request timed out.`); }
                    throw error;
                } finally {
                    clearTimeout(timer);
                }

            }
            if (urlOption == GET_INFO) {
                // return the json not the array, if only one call is made
                if (valueToReturn.length == 1) { valueToReturn = valueToReturn[0] };
            }
            return valueToReturn; // returns the result of the last call, or, batched "get" results

        } catch (error) {
            console.error(debugPrefix(), `Error: ${error.message}\n - camera: ${this.CAMERA_IP}\n - jsonList: ${JSON.stringify(jsonList)}`);
            return false;
        } finally {
            this.apiBusy = false;
        }
    }

    // -----------------------------------------------
    // wrapper functions below, called from pushButton
    // -----------------------------------------------

    async onePushFocus() {
        const e = await this.callAPI(ja_camera_do_onepush_focus); // includes j_camera_set_af_lock_ff
        return e;
    }

    async toggleAutoFocus() {
        // updating of UI should be done by server.js
        const afl = await this.get_af_lock_status();
        if (afl === 1) { // AF implied, done this way to minimise the number of API calls
            const e = await this.callAPI(j_camera_set_af_lock_off);
            return e;
        } else if (afl === 0) {
            const afm = await this.get_focus_mode_id(); // 0 = AUTO
            if (afm >= 0) {
                const j = (afm == 0) ? j_camera_set_af_lock_on : j_camera_set_focus_mode_auto;
                const e = await this.callAPI(j);
                return e;
            }
        } // else report problem
        return null; // failure
    }

    async onePushWhiteBalance() {
        const e = await this.callAPI(ja_camera_do_onepush_wb);
        return e;
    }

    async callPreset(n) {
        j_camera_call_preset__.data.id = n;
        const e = await this.callAPI(j_camera_call_preset__);
        this.lastSelectedPreset = (e || this.isDevelopment) ? n : -1;
        return e;
    }

    async setPreset(n, name = 'Preset') {
        j_camera_set_preset__.data.id = n;
        j_camera_set_preset__.data.desc = `${name} ${String(n).padStart(2,'0')}`;
        // TODO should we also set PTZ speeds prior to preset set?
        const e = await this.callAPI(j_camera_set_preset__);
        this.lastSelectedPreset = (e || this.isDevelopment) ? n : -1;
        return e;
    }

    async getFocusZone() {
        const j = await this.callAPI(j_camera_get_focus_zone, GET_INFO);
        if (j) {
            return j.data.selected_id; // numeric
        }
        return null; // failure
    }

    async setFocusZone(id) {
        // updating of UI to be done by server.js
        if (id==6) {
            // complain/block to be done server-side
            // j_camera_set_focus_zone__.data.point = { "x_percent": etc etc }
        }
        j_camera_set_focus_zone__.data.selected_id = id;
        const e = await this.callAPI(j_camera_set_focus_zone__);
        if (e) {
            const newZoneId = await this.getFocusZone();
            if (newZoneId == id) {
                return newZoneId; // success; beware 0 could inadvertently be interpreted as false/null
            } else {
                return null; // failure
            }
        }
    }

    async reloadCameraSettings() {
        // updating of UI should be done by server.js
        this.lastSelectedPreset = -1;
        const e = await this.callAPI(ja_camera_do_set_settings);
        return e;
    }

    async rebootCamera() {
        // updating of UI should be done by server.js
        this.lastSelectedPreset = -1;
        const e = await this.callAPI(j_camera_reboot);
        return e;
    }

    async wakeUpCamera() {
        // updating of UI should be done by server.js
        // called from obsConnectSuccess --> doWakeupCamera
        const e = await this.callAPI(j_camera_wakeup, undefined, 5);
        return e;
    }

    async shutdownCamera() {
        // updating of UI should be done by server.js
        // called from obs exitStarted & again at server.js shutdown
        const e = await this.callAPI(j_camera_sleep, undefined, 5);
        return e;
    }

    async isCameraResponding() {
        // j_camera_get_output_info will also return true if camera is on standby
        // TODO is there a call that will determine whether camera is on standby?
        const result = await this.callAPI(j_camera_get_output_info, GET_INFO);
        return (result) ? (result.rsp == "succeed") : false;
    }

    // -----------------------------------------------
    // wrapper functions continued: read data from cam
    // -----------------------------------------------

    async get_af_lock_status() {
        const j = await this.callAPI(j_camera_get_af_lock_status, GET_INFO);
        if (j) {
            return j.data.af_lock_status; // boolean
        }
        return null; // failure
    }

    async get_focus_mode_id() {
        const j = await this.callAPI(j_camera_get_focusmode, GET_INFO);
        if (j) {
            return j.data.selected_id; // numeric
        }
        return null; // failure
    }

    async summariseFocusMode() {
        const afm = await this.get_focus_mode_id(); // 0 = AUTO, 1 = MANUAL, 2 = ONE PUSH
        const afl = (afm === 0) ? await this.get_af_lock_status() : 0;
        const result = ['AF', 'MF', 'OP'];
        return { "mode": (afm == null) ? null : result[afm], "locked": afl }
        // { mode: null, locked: null } if failure
    }

    async getCameraSettings() {
        const e = await this.callAPI(ja_camera_do_get_settings, GET_INFO);
        return e;
        // intention that server calls this, then pushes result to the calling browser (only)
    }

    // -----------------------------------------------
    // wrapper functions for obs.js (via server.js) or server.js to call
    // -----------------------------------------------

    async setCameraTallyColor(color) {
        const msg = `Tally Colour to ${color}`;
        switch (color) {
            case "red":
                j_camera_tally_led__.data.color_id = 1
                break;
            case "green":
                j_camera_tally_led__.data.color_id = 2
                break;
            case "blue":
                j_camera_tally_led__.data.color_id = 3
                break;
            case "off":
            default:
                j_camera_tally_led__.data.color_id = 0 // TESTED 20260503: this does not switch off the tally, just the colour = off
        }
        const j = [j_camera_tally_led__];

        j.unshift(j_camera_tally_switch_on); // always switch on first
/*
        if (!this.tallySwitch) {
            j.unshift(j_camera_tally_switch_on); // turn on the tally switch, the first time we do this
            this.tallySwitch = true;
        };
*/
        const e = await this.callAPI(j);
        if (e) {
            this.emit("updateClientTallyLightIndicator", color);
            return true; // success
            // removed `const newColor = await this.getCameraTallyColor();` as this returns the old color when called here
        } else {
            console.warn(debugPrefix(), `setCameraTallyColor("${color}") failed.  Send TALLY_COLOR_UNKNOWN to app.js instead`)
            this.emit("updateClientTallyLightIndicator", TALLY_COLOR_UNKNOWN);
        }
        return false; // failure
    };

    async getCameraTallyColor() {
        const j = await this.callAPI(j_get_tally_led_color, GET_INFO);
        if (j) {
            const colors = ["off", "red", "green", "blue"];
            return colors[j.data.color_id];
        } else {
            return null; // failure
        }
    }
}

module.exports = camera

    // naming conventions
    // j_ = JSON, ja_ = array of JSON,
    // j_*__ expects the code to update the values before usage
    // j_*_DEF or j_*_state (e.g. off) represents the default, or designated 'set' instruction

    // path = system?option=setinfo -----------------------------------------------
    const j_camera_tally_switch_on  = { "group": "tally_led", "opt": "set_tally_led_switch", "data": { "switch": 1 } };
    const j_camera_tally_switch_off = { "group": "tally_led", "opt": "set_tally_led_switch", "data": { "switch": 0 } };
    const j_camera_tally_off        = { "group": "tally_led", "opt": "set_tally_led_info", "data": { "mode_id": 1, "color_id": 0 } };
    const j_camera_tally_red        = { "group": "tally_led", "opt": "set_tally_led_info", "data": { "mode_id": 1, "color_id": 1 } };
    const j_camera_tally_green      = { "group": "tally_led", "opt": "set_tally_led_info", "data": { "mode_id": 1, "color_id": 2 } };
    const j_camera_tally_blue       = { "group": "tally_led", "opt": "set_tally_led_info", "data": { "mode_id": 1, "color_id": 3 } };
    const j_camera_tally_led__      = { "group": "tally_led", "opt": "set_tally_led_info", "data": { "mode_id": 1, "color_id": 0 } };

    // path = system?option=setinfo -----------------------------------------------
    const j_camera_reboot = { "group": "syscontrol", "opt": "set_reboot_info", "data": { "command": "reboot" } };
    const j_camera_wakeup = { "group": "syscontrol", "opt": "power_on" };
    const j_camera_sleep  = { "group": "syscontrol", "opt": "power_off" };

    // path = ptz?option=setinfo --------------------------------------------------
    const j_camera_set_focus_mode_onepush = { "group": "ptz", "opt": "set_focus_mode", "data": { "focusmode": 2 } };    // focusmode:2 = onepush
    const j_camera_set_focus_mode_auto    = { "group": "ptz", "opt": "set_focus_mode", "data": { "focusmode": 0 } };
    //const j_camera_trigger_onepush_focus  = { "group": "ptz", "opt": "control", "opid": 25, "point": { "x_percent": 500, "y_percent": 500, "d_pixel": 300 } };
    const j_camera_trigger_onepush_focus  = { "group": "ptz", "opt": "control", "opid": 25 };

    const j_camera_set_preset__           = { "group": "ptz", "opt": "control", "opid": 26, "data": { "id": 1, "desc": "20aa" } };
    const j_camera_delete_preset__        = { "group": "ptz", "opt": "control", "opid": 27, "data": { "id": 1 } }; // TODO check accuracy 27 seems to delete
    const j_camera_rename_preset__        = { "group": "ptz", "opt": "control", "opid": 28, "data": { "id": 10, "desc": "update10" } }; // rename?
    const j_camera_call_preset__          = { "group": "ptz", "opt": "control", "opid": 29, "data": { "id": 1 } };

    const j_camera_set_pan_speed_DEF      = { "group": "ptz", "opt": "set_pan_speed",      "data": { "pan": 10,   "save_flag": 1 }};
    const j_camera_set_tilt_speed_DEF     = { "group": "ptz", "opt": "set_tilt_speed",     "data": { "tilt": 10,  "save_flag": 1 }};
    const j_camera_set_zoom_speed_DEF     = { "group": "ptz", "opt": "set_zoom_speed",     "data": { "zoom": 10,  "save_flag": 1 }};
    const j_camera_set_focus_speed_DEF    = { "group": "ptz", "opt": "set_focus_speed",    "data": { "focus": 10, "save_flag": 1 } };
    const j_camera_set_af_sensitivity_DEF = { "group": "ptz", "opt": "set_sensitivity",    "data": { "selected_id": 1 } };      // 1 = medium
    const j_camera_set_focus_zone__       = { "group": "ptz", "opt": "set_focus_zone",     "data": { "selected_id": 1 } };      // variable
    const j_camera_set_focus_zone_DEF     = { "group": "ptz", "opt": "set_focus_zone",     "data": { "selected_id": 1 } };      // 1 = center
    const j_camera_set_af_lock_off        = { "group": "ptz", "opt": "set_af_lock_status", "data": { "af_lock_status": 0 } };
    const j_camera_set_af_lock_on         = { "group": "ptz", "opt": "set_af_lock_status", "data": { "af_lock_status": 1 } };

    // focus area appears to be x,y ranging from 0-999 (or 1 - 1000?), and d_pixel probably uses same scale, web interface allows d_pixel 180-300
    // there might be a bug in the web interface re: x_percent

    // path = camera?option=setinfo -----------------------------------------------

    // { "group": "camera", "opt": "one_push_white_balance_trigger" };  // experiment RETURNS 00003 rsp: error
    // { "group": "camera", "opt": "onepush_wb_trigger" };              // experiment RETURNS 00003 rsp: error
    // { "group": "camera", "opt": "onepush_white_balance_trigger" };   // experiment RETURNS 00003 rsp: error
    const j_camera_set_white_balance_auto =    { "group": "camera", "opt": "set_white_balance_info", "data": { "mode": { "selected_id": 0 }, "save_flag": 1 } };
    const j_camera_set_white_balance_onepush = { "group": "camera", "opt": "set_white_balance_info", "data": { "mode": { "selected_id": 3 }, "save_flag": 1 } };
    // 2026-05-03 setting onepush(mode: 3) on its own does not seem to trigger the onepush, but setting auto does trigger an auto wb

    const j_camera_set_white_balance_info = {
        "group": "camera", "opt": "set_white_balance_info", "data": {
            "mode": { "selected_id": 3 },   // 3 = onepush, 2 = var, 1 = manual, 0 = auto
            "var": { "selected_id": 5 },    // 0::7 = 3000K::6500K
    //        "rgain": 128,                   // [Manual] RG tuning. 128 was returned.
    //        "bgain": 128,                   // [Manual] RB tuning. 128 was returned.
            "saturation": 30,               // style(beautify) specifies 30
            "hue": 0,                       // style(beautify) specifies 0
    //        "ircut": { "selected_id": 0 },  // ircut: 0 = day, 1 = night // this is not exposed in the camera web interface
    //        "wb_adjust": 0,                 // TODO what is this??? // this is not exposed in the camera web interface
            "save_flag": 1
        }
    };

    const j_camera_set_exposure_info = {
        "group": "camera",
        "opt": "set_exposure_info",
        "data": {
            "mode": { "selected_id": 2 },       // 2 = shutter priority
    //        "bright": 2,                        // [Bright] (bright is not returned, and is not exposed in camera web interface)
    //        "gain": 3,                          // [Manual] only.  gain_limit (=16) [Auto/AAE/SAE] is not in API documentation for setinfo
            "shutter": { "selected_id": 1 },    // 1 = 1/30
            "wdr": { "selected_id": 0 },        // 0 was returned, so send it again? // this is not exposed in the camera web interface
            "flicker": { "selected_id": 0 },    // flicker:0 = disable
    //        "bias_enable": 1,                   // bias_enable: 1 was returned, so send it again? // this is not exposed in the camera web interface
    //        "bias": 3,                          // [Auto/AAE] EV=bias: 3 was returned, so send it again?
            "backlight_enable": 0,              // [Auto/AAE] backlight_enable: 0 was returned, so send it again?
    //        "backlight": 8,                     // backlight: 8 was returned, so send it again? // this is not exposed in the camera web interface
            "metering": { "selected_id": 1 },   // metering: 1 = center
            "sensitive": { "selected_id": 0 },  // sensitive: 0 = auto (ISO 100 to 25600) // this is not exposed in the camera web interface
            "save_flag": 1
        }
    };

    const j_camera_set_image_info = {
        "group": "camera",
        "opt": "set_image_info",
        "data": {
            "brightness": 6,                    // style(beautify)
            "contrast": 4,                      // style(beautify)
            "sharpness": 2,                     // style(beautify)
            "gamma": { "selected_id": 1 },      // style(beautify) 1 = 0.42
            "flip": { "selected_id": 3 },       // 3 = HV-Flip
            "color_gray": { "selected_id": 0 }, // 0 = colour // this is not exposed in the camera web interface
            "save_flag": 1
        }
    };

    const j_camera_set_image_hvflip = { "group": "camera", "opt": "set_image_info", "data": { "flip": { "selected_id": 3 }, "save_flag": 1 } }; // 3 = HV-Flip

    const j_camera_set_nr_info = {
        "group": "camera",
        "opt": "set_nr_info",
        "data": {
            "nr_2d": { "selected_id": 2 },      // nr_2d id:2 = default = style(beautify)
            "nr_3d": { "selected_id": 3 },      // nr_3d id:3 = default = style(beautify)
            "correction": { "selected_id": 0 }, // correction id:0 (=disable)
            "save_flag": 1
        }
    };

    const j_camera_set_style_beautify = { "group": "camera", "opt": "set_style_info", "data": { "selected_id": 5, "save_flag": 1 } }; // 5 = beautify
    const j_camera_set_ae_lock_off = { "group": "camera", "opt": "set_ae_lock_status", "data": { "ae_lock_status": 0 } }

    // ----------------------------------------------------------------------------

    // API POST combinations
    const ja_camera_do_onepush_focus = [
        j_camera_set_af_lock_off,
        j_camera_set_focus_mode_onepush,
        j_camera_trigger_onepush_focus
    ]; // AF needs to be unlocked before switching out of AF mode

    const ja_camera_do_onepush_wb = [
        j_camera_set_white_balance_auto,
        j_camera_set_white_balance_onepush
    ]; // 20260503 the sequence of auto then onepush seems to achieve a trigger of onepush wb

    const ja_camera_do_set_settings = [
        j_camera_tally_switch_on,
        j_camera_set_af_lock_off,           // place this before setting onepush mode
        j_camera_set_focus_mode_onepush,
        j_camera_set_white_balance_info,    // TODO finalise our settings, prob redundant due to style_beautify
        j_camera_set_exposure_info,         // TODO finalise our settings
        j_camera_set_image_info,            // TODO finalise our settings, prob redundant due to style_beautify
        j_camera_set_image_hvflip,
        j_camera_set_nr_info,               // accept default 2 and 3
        j_camera_set_style_beautify,
        j_camera_set_ae_lock_off,
        j_camera_set_pan_speed_DEF,
        j_camera_set_tilt_speed_DEF,
        j_camera_set_zoom_speed_DEF,
        j_camera_set_focus_speed_DEF,
        j_camera_set_af_sensitivity_DEF,
        j_camera_set_focus_zone_DEF

        // -- below, probably better to set via web interface (from written documentation)
        // TODO - PELCO-D address = 2, baud = 2400, motion sync = yes
        // TODO - encoder - frame rate, etc
        // TODO - output 1080p60, Mute
        // TODO - audio line in, disable
        // TODO - WIFI, hotspot, bluetooth disable
    ]; // the sequence of API calls to reload the preferred image settings

    // API option=getinfo ---------------------------------------------------------
    const j_camera_get_af_lock_status = { "group": "ptz", "opt": "get_af_lock_status" };
    const j_camera_get_focusmode  = { "group": "ptz", "opt": "get_focusmode" }; // get_focusmode is correct.  get_focus_mode returns 'succeed' but no data follows
    const j_camera_get_focus_zone = { "group": "ptz", "opt": "get_focus_zone" };

    const j_get_tally_led_color = { "group": "tally_led", "opt": "get_tally_led_color" };

    const ja_camera_do_get_settings = [
        j_camera_get_focusmode,
        j_camera_get_af_lock_status,
        { "group": "ptz",    "opt": "get_sensitivity"}, // get_sensitivity in documentation could be a typo ? get_af_sensitivity ?
        j_camera_get_focus_zone,
        { "group": "ptz",    "opt": "get_focus_speed"},
        { "group": "ptz",    "opt": "get_pan_speed"},   // get_pan_speed correctly guessed (not in API documentation)
        { "group": "ptz",    "opt": "get_tilt_speed"},  // get_tilt_speed correctly guessed (not in API documentation)
        { "group": "ptz",    "opt": "get_zoom_speed"},
        { "group": "ptz",    "opt": "get_aperture"},
        { "group": "camera", "opt": "get_white_balance_info" },
        { "group": "camera", "opt": "get_exposure_info" },
        { "group": "camera", "opt": "get_image_info" },
        { "group": "camera", "opt": "get_nr_info" },
        { "group": "camera", "opt": "get_style_info" },
        { "group": "camera", "opt": "get_ae_lock_status" }
    ];

    const j_camera_get_output_info = { "group": "hdmi", "opt": "get_output_info" };
    // ----------------------------------------------------------------------------
