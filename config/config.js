const isDev = (process.env.NODE_ENV === 'development');
const { version, name } = require("../package.json");

const config = {};

config.server = {
    LISTEN_PORT: 3000,
    SERVER_ALIAS: isDev ? `http://localhost` : `http://pc-obs.av`
}

config.obs = {  // this is passed to the obs.js module on initialisation

    // `ws://${host}`
    host: isDev ? "localhost" : "localhost",
    port: 4455,
    password: process.env.OBS_PASSWORD,

    PTZ_ACTION_DEVICE_ID: isDev ? 1 : 3,                // this refers to the PTZ Controls plugin in OBS

    OVERLAY_SCENENAME: "---OVERLAY---",                 // this must match the overlay scene name in OBS
    PARENTS_OVERLAY_SOURCENAME: "parents_overlay",      // this must match the source name in the overlay scene
    CUSTOM_OVERLAY_SOURCENAME: "custom_overlay",        // this must match the source name in the overlay scene
    // see also the scene/overlay buttons in config.ui below

}

config.camera = {   // this is passed to the camera.js module on initialisation

    isDevelopment: isDev,
    // `http://${config.CAMERA_IP}`
    CAMERA_IP: isDev ? "ubuntu-server.rarebits:5000" : "192.168.32.107"
}

config.x32 = {  // this is passed to the x32.js module on initialisation

    isDevelopment: isDev,
    useGoSnippetMethod: false,      // OSC "/load snippet" vs "/-action/gosnippet"

    host: isDev ? "192.168.56.1" : "192.168.32.11",
    port: 10023,
    localPort: 10024,

    pollIntervalMs: 10000,

    signals: {

        initialise:     { type: "snippet",  snippet: 10 },
        lecternOn:      { type: "snippet",  snippet: 13 },
        lecternLouder:  { type: "snippet",  snippet: 16 },
        bandSinging:    { type: "snippet",  snippet: 11 },
        bandSpeaking:   { type: "snippet",  snippet: 15 },
        bandSpeakLouder: { type: "snippet", snippet: 12 },

        muteSpeech:     { type: "toggle",   address: "/dca/5/on",       invert: true },
        muteBand:       { type: "toggle",   address: "/config/mute/6",  invert: false },
        muteAll:        { type: "toggle",   address: "/config/mute/1",  invert: false },

        muteVocalReverb:{ type: "toggle",   address: "/dca/8/on",       invert: true },
        muteAmbient:    { type: "toggle",   address: "/ch/23/mix/on",   invert: true },

        volumeDCAVocal: { type: "fader",    address: "/dca/1/fader"},

        volumeMain:     { type: "fader",    address: "/main/st/mix/fader" }
    }
}

config.ui = {   // this is exposed to the app.js module, and also applicable to server.js
    isDevelopment: isDev,
    versionString: `${name} v${version}`,
    greetingMessage: "Hello :-)",

    urlToShow:   `${config.server.SERVER_ALIAS}:${config.server.LISTEN_PORT}`,
    urlHelpPage: `${config.server.SERVER_ALIAS}:${config.server.LISTEN_PORT}/help/help.html`,

    // X32 actions
    buttons: [
        { id: "btnBandSpeaking",    signalId: "bandSpeaking",   label: "Band Talking" },
        { id: "btnBandSpeakLouder", signalId: "bandSpeakLouder", label: "Band Talk Louder" },
        { id: "btnBandSinging",     signalId: "bandSinging",    label: "Band Singing 𝄞🎹" },
        { id: "btnMuteBand",        signalId: "muteBand",       label: "Mute Band" },
        { id: "" },
        { id: "btnLecternOn",       signalId: "lecternOn",      label: "Lectern On" },
        { id: "btnLecternLouder",   signalId: "lecternLouder",  label: "Lectern Louder" },
        { id: "btnMuteSpeech",      signalId: "muteSpeech",     label: "Mute Speech" },
        { id: "" },
        { id: "btnMuteAll",         signalId: "muteAll",        label: "Mute All Mics" },
        { id: "" },
        { id: "btnInitialise",      signalId: "initialise",     label: "Initialise...",
            confirm: true, helpText: "This will do basic settings for speech" }
    ],

    // not actions
    indicators: [
        { id: "" },
        { id: "indVocalReverbMuted",    signalId: "muteVocalReverb",    label: "Vocals Reverb Muted" },
        { id: "indAmbientMuted",        signalId: "muteAmbient",        label: "Ambient Mic Muted" },
        { id: "" }
    ],

    // not actions (not intended)
    faders: [
        { id: "fdrMain",        signalId: "volumeMain",     label: "Main should be 0 dB →" },
        { id: "fdrDCAVocal",    signalId: "volumeDCAVocal", label: "Vocal group" }
    ],

    cameraPresets: [
        { PresetNumber: 2, PresetName: "Lectern" },
        { PresetNumber: 3, PresetName: "w/Lead" },
        { PresetNumber: 5, PresetName: "Band right" },
        { PresetNumber: 6, PresetName: "Band full" },
        { PresetNumber: 4, PresetName: "Drums" },
        { PresetNumber: 0, PresetName: "Home/cross" }
    ],

    obsScenes: [
        // sceneName spellings must match the scene names in OBS
        { id: "btnOBS_01", sceneName: "2 BAND: lead",             label: "BAND: lead" },
        { id: "btnOBS_02", sceneName: "3 BAND: right + words",    label: "BAND: right + words" },
        { id: "btnOBS_03", sceneName: "1 BAND: full + words",     label: "BAND: full + words" },
        { id: "btnOBS_04", sceneName: "4 STAGE",                  label: "STAGE" },
        { id: "" },
        { id: "btnOBS_05", sceneName: "5 LECTERN",                label: "LECTERN" },
        { id: "btnOBS_06", sceneName: "6 Lectern as inset",       label: "Lectern as inset" },
        { id: "btnOBS_07", sceneName: "7 Reading",                label: "Lectern Reading" },
        { id: "btnOBS_08", sceneName: "8 Fullscreen Laptop",      label: "Fullscreen Laptop" },
        { id: "" },
        { id: "btnOBS_09", sceneName: "Celebrations",             label: "Celebrations" },
        { id: "btnOBS_10", sceneName: "EMERGENCY",                label: "EMERGENCY" },
        { id: "btnOBS_11", sceneName: "Video Being Shown",        label: "Video Being Shown" },
        { id: "btnOBS_12", sceneName: "Pre-Service",              label: "Pre-Service" },
        { id: "" }
    ],

    overlays: {
        parents: { btnId: "btnOverlayParents",  sourceName: config.obs.PARENTS_OVERLAY_SOURCENAME,  label: "Parents collect after..." },
        custom:  { btnId: "btnOverlayCustom",   sourceName: config.obs.CUSTOM_OVERLAY_SOURCENAME,   label: "Custom message..." }
    },

    DEFAULT_OVERLAY_TIMEOUT_SECONDS: 300

}

module.exports = config;