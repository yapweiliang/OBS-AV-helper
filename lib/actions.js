module.exports = {

    async execute(button) {

        switch (button.action) {

            case "snippet":
                console.log(
                    `Recall snippet ${button.snippet}`
                );
                break;

            case "toggleMute":
                console.log(
                    `Toggle ${button.address}`
                );
                break;

            default:
                console.warn(
                    `Unknown action ${button.action}`
                );
        }
    }

};