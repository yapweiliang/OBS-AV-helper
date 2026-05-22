const config = require("../config/config");

module.exports = {

    async execute(buttonId) {

        const action = config.actions[buttonId];

        if (!action) {
            throw new Error( `Unknown action: ${buttonId}` );
        }

        switch (action.type) {

            case "snippet":

                console.log( `Recall snippet ${action.snippet}` );
                break;

            case "toggleMute":

                console.log( `Toggle ${action.address}` );
                break;

            default:

                throw new Error( `Unknown action type: ${action.type}` ); }
    }
};