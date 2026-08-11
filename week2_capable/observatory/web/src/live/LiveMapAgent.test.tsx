// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LiveMapAgentFigure } from "./LiveMapAgent";

describe("live map agent warp", () => {
  it("ports the mock shrink, spin, and three warp rings", () => {
    const { container } = render(
      <svg>
        <LiveMapAgentFigure
          at={{ x: 10, y: 20 }}
          facing={1}
          moving={false}
          warp={1}
        />
      </svg>,
    );

    expect(container.querySelector(".live-map-agent"))
      .toHaveClass("is-warping");
    expect(container.querySelectorAll(".ring.is-warp")).toHaveLength(3);
    expect(container.querySelector(".ring:not(.is-warp)"))
      .toHaveAttribute("opacity", "0");
    expect(container.querySelector(".figure"))
      .toHaveAttribute(
        "transform",
        "translate(10 20) rotate(540) scale(0.18000000000000005 0.18000000000000005)",
      );
  });
});
