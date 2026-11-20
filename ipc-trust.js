'use strict';

const { trustedUiUrl } = require('./renderer-protocol.js');

function makeTrust(getWindow) {
  return (event) => {
    const win = getWindow();
    if (!win || win.isDestroyed() || event?.sender !== win.webContents) return false;
    const frame = event.senderFrame;
    return frame && frame === win.webContents.mainFrame && trustedUiUrl(frame.url);
  };
}

module.exports = { makeTrust };
