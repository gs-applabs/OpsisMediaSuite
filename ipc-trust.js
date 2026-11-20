'use strict';

function makeTrust(getWindow) {
  return (event) => {
    const win = getWindow();
    if (!win || win.isDestroyed() || event?.sender !== win.webContents) return false;
    const frame = event.senderFrame;
    return frame && frame === win.webContents.mainFrame && /^file:\/\/\//i.test(frame.url);
  };
}

module.exports = { makeTrust };
