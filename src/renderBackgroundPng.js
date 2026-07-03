const { generateBackgroundSvg } = require("./generateBackground");
const { renderSvgToPng } = require("./renderSvgToPng");

function renderBackgroundPng(svgString, options = {}) {
  const { svg, dimensions } = generateBackgroundSvg(svgString);
  const scale = options.scale || 1;
  const rendered = renderSvgToPng(svg, {
    width: Math.round(dimensions.width * scale),
  });
  return {
    png: rendered.png,
    width: rendered.width,
    height: rendered.height,
    dimensions,
  };
}

module.exports = { renderBackgroundPng };
