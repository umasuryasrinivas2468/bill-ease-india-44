import fs from 'fs';
import path from 'path';
import { generateAnnualReport } from '../src/utils/annualReportGenerator';

async function main() {
  const year = process.argv[2] || '2024-25';
  const ownerName = process.argv[3] || 'BODAPATI UMA SURYA SRINIVAS';

  try {
    const doc = await generateAnnualReport(year, ownerName);

    // Prefer nodebuffer output when running in Node (supported by jspdf)
    let buffer: Buffer;
    try {
      // @ts-ignore - 'nodebuffer' may not be in typings depending on jspdf version
      const nb = doc.output('nodebuffer');
      if (nb && (nb instanceof Buffer || ArrayBuffer.isView(nb) || nb instanceof ArrayBuffer)) {
        buffer = Buffer.from(nb as any);
      }
    } catch (e) {
      // fallback to arraybuffer
    }

    if (!buffer) {
      const arr = doc.output('arraybuffer') as ArrayBuffer;
      buffer = Buffer.from(arr);
    }

    const outPath = path.resolve(process.cwd(), `annual-report-${year.replace('/', '-')}.pdf`);
    // Basic sanity check: PDF files start with "%PDF"
    const header = buffer.slice(0, 4).toString('utf8');
    if (!header.startsWith('%PDF')) {
      const failPath = outPath + '.failed.txt';
      fs.writeFileSync(failPath, buffer);
      console.error('Generated file does not look like a PDF. Wrote raw output to:', failPath);
      throw new Error('Generated output is not a valid PDF (missing %PDF header)');
    }

    fs.writeFileSync(outPath, buffer);
    console.log('Annual report written:', outPath, 'size:', buffer.length);
  } catch (err) {
    console.error('Error generating annual report:', err);
    process.exit(1);
  }
}

main();
