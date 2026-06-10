import mammoth from 'mammoth';

export async function importDocxAsHtml(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.convertToHtml({ arrayBuffer });
  return value;
}
