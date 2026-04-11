import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ValidationError } from '@/utils/importValidator';

interface Props {
  validCount: number;
  invalidCount: number;
  validRows: any[];
  invalidRows: Array<{ row: any; errors: ValidationError[] }>;
}

const ImportPreview: React.FC<Props> = ({ validCount, invalidCount, validRows, invalidRows }) => {
  const displayRows = validRows.slice(0, 50);
  const headers = displayRows.length > 0 ? Object.keys(displayRows[0]) : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{validCount}</div>
              <p className="text-sm text-muted-foreground">Valid Rows</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">{invalidCount}</div>
              <p className="text-sm text-muted-foreground">Invalid Rows</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {validCount > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold mb-3">Preview Valid Rows (first {Math.min(displayRows.length, 50)})</h3>
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="px-2 py-1 text-left border">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, idx) => (
                    <tr key={idx} className="odd:bg-white even:bg-gray-50">
                      {headers.map((h) => (
                        <td key={h} className="px-2 py-1 border truncate max-w-xs">
                          {String(row[h] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {invalidCount > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold mb-3 text-red-600">Error Details (first 10)</h3>
            <div className="space-y-2 text-sm">
              {invalidRows.slice(0, 10).map((item, idx) => (
                <div key={idx} className="border-l-4 border-red-400 pl-3 py-1">
                  <p className="font-mono text-xs text-gray-600">Row {item.errors[0].rowIndex + 1}</p>
                  <ul className="list-disc ml-5 text-red-600">
                    {item.errors.map((err, i) => (
                      <li key={i}>
                        <strong>{err.field}:</strong> {err.reason} (got: {String(err.value)})
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ImportPreview;
