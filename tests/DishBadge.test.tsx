// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DishBadge } from "@/components/DishBadge";

describe("<DishBadge>", () => {
  it("affiche le libellé du badge", () => {
    render(<DishBadge kind="Healthy" />);
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("affiche le badge Populaire", () => {
    render(<DishBadge kind="Populaire" />);
    expect(screen.getByText("Populaire")).toBeInTheDocument();
  });

  it("ne rend rien quand kind est null", () => {
    const { container } = render(<DishBadge kind={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
