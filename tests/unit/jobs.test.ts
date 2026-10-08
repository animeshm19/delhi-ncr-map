import { describe, expect, it, vi } from "vitest";
import { boardApiUrl, fetchBoard, mapLimit, parseBoard, MAX_JOBS } from "@/lib/jobs";

describe("boardApiUrl", () => {
  it("builds each provider's public endpoint", () => {
    expect(boardApiUrl("greenhouse", "acme")).toBe("https://boards-api.greenhouse.io/v1/boards/acme/jobs");
    expect(boardApiUrl("lever", "acme")).toBe("https://api.lever.co/v0/postings/acme?mode=json");
    expect(boardApiUrl("ashby", "Acme.Inc")).toBe("https://api.ashbyhq.com/posting-api/job-board/Acme.Inc");
  });

  it("refuses handles that could change the path or host", () => {
    for (const bad of ["", "../admin", "a/b", "a?b", "a#b", "evil.com@x", "a b", "x".repeat(81), ".."]) {
      expect(() => boardApiUrl("lever", bad), bad).toThrow();
    }
    expect(() => boardApiUrl("workday" as never, "acme")).toThrow(/unknown job board/);
  });

  it("swaps the host only when a test origin is given", () => {
    expect(boardApiUrl("lever", "acme", "http://localhost:54321/__boards/")).toBe(
      "http://localhost:54321/__boards/lever/v0/postings/acme?mode=json",
    );
  });
});

describe("parseBoard", () => {
  it("reads Greenhouse", () => {
    const jobs = parseBoard("greenhouse", {
      jobs: [
        {
          title: " Backend\nEngineer ",
          absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1",
          location: { name: "Gurugram" },
          departments: [{ name: "Engineering" }],
          first_published: "2026-09-30T10:00:00Z",
        },
      ],
    });
    expect(jobs).toEqual([
      { title: "Backend Engineer", team: "Engineering", location: "Gurugram", url: "https://job-boards.greenhouse.io/acme/jobs/1", posted: "2026-09-30" },
    ]);
  });

  it("reads Lever", () => {
    const [j] = parseBoard("lever", [
      { text: "Designer", hostedUrl: "https://jobs.lever.co/acme/abc", categories: { team: "Design", location: "Remote" }, createdAt: 1790000000000 },
    ]);
    expect(j).toMatchObject({ title: "Designer", team: "Design", location: "Remote", url: "https://jobs.lever.co/acme/abc" });
    expect(j.posted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reads Ashby and skips unlisted roles", () => {
    const jobs = parseBoard("ashby", {
      jobs: [
        { title: "PM", jobUrl: "https://jobs.ashbyhq.com/acme/1", department: "Product", location: "Gurugram", publishedAt: "2026-10-01" },
        { title: "Hidden", jobUrl: "https://jobs.ashbyhq.com/acme/2", isListed: false },
      ],
    });
    expect(jobs.map((j) => j.title)).toEqual(["PM"]);
  });

  it("drops roles with unsafe or missing links, blank titles and duplicates", () => {
    const jobs = parseBoard("lever", [
      { text: "Script", hostedUrl: "javascript:alert(1)" },
      { text: "Plain http", hostedUrl: "http://jobs.lever.co/acme/1" },
      { text: "Userinfo", hostedUrl: "https://jobs.lever.co@evil.example/1" },
      { text: "No link" },
      { text: "   ", hostedUrl: "https://jobs.lever.co/acme/2" },
      { text: "Good", hostedUrl: "https://jobs.lever.co/acme/3" },
      { text: "Good again", hostedUrl: "https://jobs.lever.co/acme/3" },
      null,
      "junk",
    ]);
    expect(jobs.map((j) => j.title)).toEqual(["Good"]);
  });

  it("survives unexpected shapes", () => {
    expect(parseBoard("greenhouse", null)).toEqual([]);
    expect(parseBoard("greenhouse", { jobs: "nope" })).toEqual([]);
    expect(parseBoard("lever", { error: "not found" })).toEqual([]);
    expect(parseBoard("ashby", [])).toEqual([]);
  });

  it("caps very long titles and very large boards", () => {
    const many = Array.from({ length: MAX_JOBS + 50 }, (_, i) => ({ text: "x".repeat(500), hostedUrl: `https://jobs.lever.co/a/${i}` }));
    const jobs = parseBoard("lever", many);
    expect(jobs).toHaveLength(MAX_JOBS);
    expect(jobs[0].title).toHaveLength(200);
  });
});

describe("fetchBoard", () => {
  it("fetches without following redirects and parses", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{ text: "Role", hostedUrl: "https://jobs.lever.co/a/1" }])));
    const jobs = await fetchBoard("lever", "a", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(jobs).toHaveLength(1);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.redirect).toBe("error");
  });

  it("reports HTTP errors so the hiring flag is left alone", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 404 }));
    await expect(fetchBoard("lever", "a", { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow("HTTP 404");
  });
});

describe("mapLimit", () => {
  it("keeps order and bounds concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBe(2);
  });
});
