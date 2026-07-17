#!/usr/bin/env node
const path = require('path')
const fs = require('fs')

async function generatePdf(htmlFile, pdfFile) {
  const dir = __dirname
  const htmlPath = path.join(dir, htmlFile)
  const pdfPath = path.join(dir, pdfFile)

  if (!fs.existsSync(htmlPath)) {
    console.error('HTML file not found:', htmlPath)
    process.exit(1)
  }

  let puppeteer
  try {
    puppeteer = require('puppeteer')
  } catch {
    console.log('Installing puppeteer...')
    const { execSync } = require('child_process')
    execSync('npm init -y && npm install puppeteer', {
      cwd: dir,
      stdio: 'inherit',
    })
    puppeteer = require('puppeteer')
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const page = await browser.newPage()
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' })
  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  })

  await browser.close()
  console.log('PDF created:', pdfPath)
}

async function main() {
  await generatePdf('svg-structure-guide.html', 'Seatmap-SVG-Structure-Guide.pdf')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
