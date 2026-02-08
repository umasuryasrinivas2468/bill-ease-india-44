#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { generateToFile } = require('../server/annualReportGenerator');

async function main() {
  const year = process.argv[2] || '2024-25';
  const ownerName = process.argv[3] || 'BODAPATI UMA SURYA SRINIVAS';
  const outPath = path.resolve(process.cwd(), `annual-report-${String(year).replace(/[\\/\\\\]/g, '-')}.pdf`);
  try {
    await generateToFile(outPath, String(year), String(ownerName));
    console.log('Annual report written:', outPath);
  } catch (err) {
    console.error('Error generating annual report (node):', err);
    process.exit(1);
  }
}

main();
