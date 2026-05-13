import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseInlineAgentText, structureAgentAnswer } from "./agentAnswerFormat";

describe("parseInlineAgentText", () => {
  it("renders bold segments", () => {
    const html = renderToStaticMarkup(<>{parseInlineAgentText("See **bold** here.")}</>);
    expect(html).toContain("<strong");
    expect(html).toContain("bold");
  });

  it("renders chunk badges", () => {
    const html = renderToStaticMarkup(<>{parseInlineAgentText("Ref [chunk: 3 ] end")}</>);
    expect(html).toContain("chunk 3");
    expect(html).toContain("font-mono");
  });
});

describe("structureAgentAnswer", () => {
  it("wraps bullet lines in a list", () => {
    const html = renderToStaticMarkup(<>{structureAgentAnswer("- one\n- two")}</>);
    expect(html).toContain("<ul");
    expect(html.match(/<li/g)?.length).toBe(2);
    expect(html).toContain("one");
    expect(html).toContain("two");
  });

  it("mixes paragraphs and lists", () => {
    const html = renderToStaticMarkup(
      <>{structureAgentAnswer("Intro line\n\n- item a\n- item b\n\nOutro.")}</>,
    );
    expect(html).toContain("Intro line");
    expect(html).toContain("item a");
    expect(html).toContain("Outro");
  });
});
