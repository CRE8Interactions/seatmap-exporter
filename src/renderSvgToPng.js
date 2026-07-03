function renderSvgToPng(svgString, options = {}) {
  let resvg;
  try {
    resvg = require("@resvg/resvg-js");
  } catch {
    throw new Error(
      "PNG export requires @resvg/resvg-js. Run npm install in seatmap-export."
    );
  }

  const fitWidth = options.width;
  const renderer = new resvg.Resvg(svgString, {
    fitTo: fitWidth
      ? {
          mode: "width",
          value: Math.round(fitWidth),
        }
      : undefined,
    ...(options.resvgOptions || {}),
  });
  const rendered = renderer.render();
  return {
    png: rendered.asPng(),
    width: rendered.width,
    height: rendered.height,
  };
}

module.exports = { renderSvgToPng };
