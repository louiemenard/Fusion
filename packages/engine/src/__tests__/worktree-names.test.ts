import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateWorktreeName, ADJECTIVES, NOUNS, planTaskWorktreePath, resolveTaskWorkingBranch } from "../worktree/worktree-names.js";

describe("resolveTaskWorkingBranch", () => {
  it("returns canonical per-task branch for shared assignment mode", () => {
    expect(resolveTaskWorkingBranch({ id: "FN-5818", branch: "clionboarding", branchContext: { assignmentMode: "shared", groupId: "bg-1", source: "planning" } })).toBe("fusion/fn-5818");
  });

  it("returns explicit branch for per-task-derived assignment mode", () => {
    expect(resolveTaskWorkingBranch({ id: "FN-5818", branch: "fusion/custom", branchContext: { assignmentMode: "per-task-derived", groupId: "bg-1", source: "planning" } })).toBe("fusion/custom");
  });

  it("returns canonical branch for ungrouped task without branch", () => {
    expect(resolveTaskWorkingBranch({ id: "FN-5818", branch: undefined })).toBe("fusion/fn-5818");
  });

  it("returns explicit branch for ungrouped task with branch", () => {
    expect(resolveTaskWorkingBranch({ id: "FN-5818", branch: "feature/fn-5818" })).toBe("feature/fn-5818");
  });
});

describe("generateWorktreeName", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "fn-wt-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns a name matching adjective-noun pattern", () => {
    const name = generateWorktreeName(tempDir);
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("returns different names on subsequent calls (not deterministic)", () => {
    // Generate several names — at least some should differ
    const names = new Set<string>();
    for (let i = 0; i < 20; i++) {
      names.add(generateWorktreeName(tempDir));
    }
    // With 2500 combinations and 20 draws, we'd expect multiple unique names
    expect(names.size).toBeGreaterThan(1);
  });

  it("avoids collision with existing .worktrees/ directories", () => {
    // Create .worktrees dir with a known name
    const worktreesDir = join(tempDir, ".worktrees");
    mkdirSync(worktreesDir, { recursive: true });

    // We need to force a collision — mock Math.random to always pick the same words
    const originalRandom = Math.random;
    Math.random = () => 0; // Will always pick first adjective and first noun
    try {
      // First call: should get the base name (e.g., "amber-badger")
      const firstName = generateWorktreeName(tempDir);
      expect(firstName).toMatch(/^[a-z]+-[a-z]+$/);
      expect(firstName).not.toMatch(/-\d+$/); // no suffix

      // Create that directory to simulate collision
      mkdirSync(join(worktreesDir, firstName));

      // Second call: should get a suffixed name
      const secondName = generateWorktreeName(tempDir);
      expect(secondName).toBe(`${firstName}-2`);

      // Create that too
      mkdirSync(join(worktreesDir, secondName));

      // Third call: should get -3
      const thirdName = generateWorktreeName(tempDir);
      expect(thirdName).toBe(`${firstName}-3`);
    } finally {
      Math.random = originalRandom;
    }
  });

  it("works when .worktrees/ directory does not exist", () => {
    // tempDir has no .worktrees/ subdirectory
    const name = generateWorktreeName(tempDir);
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("ADJECTIVES and NOUNS share no common elements", () => {
    const overlap = ADJECTIVES.filter((w) => NOUNS.includes(w));
    expect(overlap).toEqual([]);
  });

  it("ADJECTIVES and NOUNS each have exactly 50 entries", () => {
    expect(ADJECTIVES).toHaveLength(50);
    expect(NOUNS).toHaveLength(50);
  });

  it("never generates a tautological name (adjective === noun)", () => {
    const names: string[] = [];
    for (let i = 0; i < 250; i++) {
      names.push(generateWorktreeName(tempDir));
    }
    for (const name of names) {
      const parts = name.split("-");
      expect(parts[0]).not.toBe(parts[1]);
    }
  });
});

/*
FNXC:WorkspaceWorktree 2026-08-24-06:11:
R14: the `branch` naming mode has to work on the SINGLE-repository path too, or an operator who
selects it for a normal project silently gets random names. This is the planner site (scheduler
dispatch and the manual-move route); the acquisition-time site is covered in
worktree-acquisition-workspace.test.ts. The fallback ladder is shared with the workspace path, so
these cases pin the wiring and the degradation, not the slug algorithm.
*/
describe("planTaskWorktreePath branch naming", () => {
  // Pure string fixture: planTaskWorktreePath only composes a path, it never creates one.
  const rootDir = "/repos/fn-branch-naming-root";
  const task = (overrides: Record<string, unknown> = {}) => ({
    id: "FN-9300",
    title: "A title",
    description: "a description",
    branch: "feature/PRD-1234-my-slug",
    ...overrides,
  });

  it("names the directory after the ticket the branch identifies", () => {
    expect(planTaskWorktreePath(task(), rootDir, "branch", new Set()))
      .toBe(join(rootDir, ".worktrees", "prd-1234-my-slug"));
  });

  it("drops the namespace and lowercases", () => {
    expect(planTaskWorktreePath(task({ branch: "PRD-1234-MY-SLUG" }), rootDir, "branch", new Set()))
      .toBe(join(rootDir, ".worktrees", "prd-1234-my-slug"));
  });

  it("falls back to the task id for a branch that slugs to empty", () => {
    expect(planTaskWorktreePath(task({ branch: "feature/---" }), rootDir, "branch", new Set()))
      .toBe(join(rootDir, ".worktrees", "fn-9300"));
  });

  it("falls back to the task id for a reserved container name in any case", () => {
    expect(planTaskWorktreePath(task({ branch: "feature/.AI-Merge" }), rootDir, "branch", new Set()))
      .toBe(join(rootDir, ".worktrees", "fn-9300"));
  });

  it("falls back to the task id when the slug is already reserved in this dispatch", () => {
    expect(planTaskWorktreePath(task(), rootDir, "branch", new Set(["prd-1234-my-slug"])))
      .toBe(join(rootDir, ".worktrees", "fn-9300"));
  });

  it("derives the canonical fusion branch when the task carries none", () => {
    expect(planTaskWorktreePath(task({ branch: undefined }), rootDir, "branch", new Set()))
      .toBe(join(rootDir, ".worktrees", "fn-9300"));
  });

  it("reuses an already-assigned worktree regardless of mode", () => {
    expect(planTaskWorktreePath(task({ worktree: "/repos/existing/dir" }), rootDir, "branch", new Set()))
      .toBe("/repos/existing/dir");
  });
});
