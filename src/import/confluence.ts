import * as cheerio from "cheerio";
import { htmlToTipTap } from "./html";
import type { ParseResult } from "../core/types";

export function confluenceToTipTap(html: string): ParseResult {
  const cleaned = cleanConfluenceHtml(html);
  return htmlToTipTap(cleaned);
}

function cleanConfluenceHtml(html: string): string {
  const $ = cheerio.load(html);

  $(".page-metadata").remove();
  $(".aui-header").remove();
  $(".aui-sidebar").remove();
  $("#footer").remove();
  $(".page-actions").remove();
  $(".breadcrumb-section").remove();
  $(".navigation").remove();

  $("ac\\:structured-macro[ac\\:name='code']").each((_, el) => {
    const macro = $(el);
    const body = macro.find("ac\\:plain-text-body").text();
    const langParam = macro.find("ac\\:parameter[ac\\:name='language']").text();

    const pre = $("<pre></pre>");
    const code = $("<code></code>").text(body);
    if (langParam) {
      code.addClass(`language-${langParam}`);
    }
    pre.append(code);
    macro.replaceWith(pre);
  });

  $("ac\\:structured-macro[ac\\:name='info'], ac\\:structured-macro[ac\\:name='warning'], ac\\:structured-macro[ac\\:name='note'], ac\\:structured-macro[ac\\:name='tip']").each((_, el) => {
    const macro = $(el);
    const body = macro.find("ac\\:rich-text-body").html();
    if (body) {
      const blockquote = $("<blockquote></blockquote>").html(body);
      macro.replaceWith(blockquote);
    } else {
      macro.remove();
    }
  });

  $("ac\\:structured-macro[ac\\:name='panel']").each((_, el) => {
    const macro = $(el);
    const body = macro.find("ac\\:rich-text-body").html();
    if (body) {
      const blockquote = $("<blockquote></blockquote>").html(body);
      macro.replaceWith(blockquote);
    } else {
      macro.remove();
    }
  });

  $("ac\\:image").each((_, el) => {
    const imgEl = $(el);
    const attachment = imgEl.find("ri\\:attachment");
    const url = imgEl.find("ri\\:url");

    let src = "";
    if (url.length > 0) {
      src = url.attr("ri:value") || "";
    } else if (attachment.length > 0) {
      src = attachment.attr("ri:filename") || "";
    }

    const alt = imgEl.attr("ac:alt") || "";
    const img = $("<img>").attr("src", src).attr("alt", alt);
    imgEl.replaceWith(img);
  });

  $("ac\\:structured-macro").each((_, el) => {
    const macro = $(el);
    const body = macro.find("ac\\:rich-text-body").html();
    if (body) {
      macro.replaceWith(body);
    } else {
      macro.remove();
    }
  });

  $("ac\\:emoticon").remove();
  $("ac\\:placeholder").remove();

  const mainContent = $(".wiki-content").html() ||
    $(".content-body").html() ||
    $("body").html() ||
    $.html();

  return mainContent || "";
}
