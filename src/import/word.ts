import mammoth from "mammoth";
import { htmlToTipTap } from "./html";
import type { TipTapDoc, ParseResult } from "../core/types";

export interface WordResult extends ParseResult {
  doc: TipTapDoc;
}

export async function wordToTipTap(buffer: ArrayBuffer): Promise<WordResult> {
  const nodeBuffer = Buffer.from(buffer);
  const result = await mammoth.convertToHtml(
    { buffer: nodeBuffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
      ],
    },
  );

  const { title, doc } = htmlToTipTap(result.value);
  return { title, doc };
}
