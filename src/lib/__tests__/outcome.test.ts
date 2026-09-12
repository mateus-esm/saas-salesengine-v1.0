import { describe, expect, it } from "vitest";

import { stageForStatus, statusForStage } from "../outcome";

const st = (id: string, stage_type: string, position: number) => ({ id, stage_type, position });

const full = [st("novo", "open", 1), st("prop", "open", 2), st("ganho", "won", 3), st("perdido", "lost", 4), st("sem", "lost", 5)];
const noTerminals = [st("a", "open", 1), st("b", "open", 2)];

describe("statusForStage — the stage decides the outcome", () => {
  it("a won or lost stage closes the deal as that", () => {
    expect(statusForStage(full, "ganho", "open")).toBe("won");
    expect(statusForStage(full, "sem", "open")).toBe("lost");
  });

  it("an open stage reopens a closed deal when the pipeline has where to close", () => {
    expect(statusForStage(full, "prop", "won")).toBe("open");
    expect(statusForStage(full, "novo", "lost")).toBe("open");
  });

  it("without a stage of that type, the written status stands", () => {
    expect(statusForStage(noTerminals, "b", "won")).toBe("won");
  });
});

describe("stageForStatus — writing the outcome moves the deal", () => {
  it("won/lost go to the first stage of that type", () => {
    expect(stageForStatus(full, "prop", "won")).toBe("ganho");
    expect(stageForStatus(full, "prop", "lost")).toBe("perdido");
  });

  it("already in a stage of that type: stays", () => {
    expect(stageForStatus(full, "sem", "lost")).toBe("sem");
  });

  it("reopening a closed deal goes to the first open stage; an open deal stays", () => {
    expect(stageForStatus(full, "ganho", "open")).toBe("novo");
    expect(stageForStatus(full, "prop", "open")).toBe("prop");
  });

  it("no stage of that type: stays where it is", () => {
    expect(stageForStatus(noTerminals, "b", "won")).toBe("b");
  });
});
