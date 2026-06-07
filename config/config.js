const isDev = (process.env.NODE_ENV === 'development');

module.exports = {

    obs: {
        // `ws://${host}`
        host: isDev ? "localhost" : "192.168.32.100",
        port: 4455,
        password: process.env.OBS_PASSWORD,

        PTZ_ACTION_DEVICE_ID: isDev ? 1 : 3,

        OVERLAY_SCENENAME: "---OVERLAY---",
        PARENTS_OVERLAY_SOURCENAME: "parents_overlay",
        CUSTOM_OVERLAY_SOURCENAME: "custom_overlay",
        
        DEFAULT_OVERLAY_TIMEOUT_SECONDS: 300
    },

    camera: {
        // `http://${config.CAMERA_IP}`
        CAMERA_IP: isDev ? "ubuntu-server.rarebits:5000" : "192.168.32.107"  
    },

    x32: {
        isDevelopment: isDev,

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

            testVolume:     { type: "fader",    address: "/ch/01/mix/fader" }
        }
    },

    ui: {
        isDevelopment: isDev,

        // actions
        buttons: [
            { id: "btnMuteSpeech",      signalId: "muteSpeech",     label: "Mute Speech" },
            { id: "btnMuteBand",        signalId: "muteBand",       label: "Mute Band" },
            { id: "" },
            { id: "btnLecternOn",       signalId: "lecternOn",      label: "Lectern On" },
            { id: "btnLecternLouder",   signalId: "lecternLouder",  label: "Lectern Louder" },
            { id: "btnBandSinging",     signalId: "bandSinging",    label: "Band Singing" },
            { id: "btnBandSpeaking",    signalId: "bandSpeaking",   label: "Band Speaking" },
            { id: "btnBandSpeakLouder", signalId: "bandSpeakLouder", label: "Band Speak Louder" },
            { id: "" },
            { id: "btnInitialise",      signalId: "initialise",     label: "Initialise...",
                confirm: true, helpText: "This will do basic settings for speech" }
        ],

        // not actions
        indicators: [
            { id: "indSpeechMuted", signalId: "muteSpeech",     label: "Speech Muted" },
            { id: "indBandMuted",   signalId: "muteBand",       label: "Band Muted" }
        ],

        // not actions (not intended)
        faders: [
            { id: "fdrTest",        signalId: "testVolume",     label: "ch 1 test"}
        ],

        cameraPresets: [
            { PresetNumber: 2, PresetName: "Lectern" },
            { PresetNumber: 3, PresetName: "w/Lead" },
            { PresetNumber: 5, PresetName: "Band right" },
            { PresetNumber: 6, PresetName: "Band full" },
            { PresetNumber: 4, PresetName: "Drums" },
            { PresetNumber: 0, PresetName: "Home/cross" }
        ],

        DISABLE_SET_BUTTONS_AFTER_S: 30,    // how many seconds delay before disabling the SET button
        //PRESETS_TABLE_MINIMUM_ROWS: 2,              // suggest 2 rows.  e.g. show top 2 presets always

        obsScenes: [
            { id: "btnOBS_01", sceneName: "2 BAND: lead",             label: "BAND: lead" },
            { id: "btnOBS_02", sceneName: "3 BAND: right + words",    label: "BAND: right + words" },
            { id: "btnOBS_03", sceneName: "1 BAND: full + words",     label: "BAND: full + words" },
            { id: "btnOBS_04", sceneName: "4 STAGE",                  label: "STAGE (to rename)" },
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
        ]
    }
};