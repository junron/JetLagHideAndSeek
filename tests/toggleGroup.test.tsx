import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
    ToggleGroup,
    ToggleGroupItem,
} from "../src/components/ui/toggle-group";

describe("answer toggle selection", () => {
    it("adds a green outline style when selectedOutline is enabled", () => {
        const markup = renderToStaticMarkup(
            <ToggleGroup type="single" value="yes" selectedOutline>
                <ToggleGroupItem value="no">No</ToggleGroupItem>
                <ToggleGroupItem value="yes">Yes</ToggleGroupItem>
            </ToggleGroup>,
        );

        expect(markup).toContain("data-[state=on]:outline-[3px]");
        expect(markup).toContain("data-[state=on]:outline-green-500");
        expect(markup).toContain("data-[state=on]:outline-offset-[-3px]");
    });
});
