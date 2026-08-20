import { describe, expect, it } from "vitest";
import { getYouTubeVideoId } from "./routers/commerce";

describe("getYouTubeVideoId", () => {
  it("aceita os formatos públicos mais usados do YouTube", () => {
    const videoId = "dQw4w9WgXcQ";
    expect(getYouTubeVideoId(`https://www.youtube.com/watch?v=${videoId}`)).toBe(videoId);
    expect(getYouTubeVideoId(`https://youtu.be/${videoId}?feature=share`)).toBe(videoId);
    expect(getYouTubeVideoId(`https://www.youtube.com/shorts/${videoId}`)).toBe(videoId);
    expect(getYouTubeVideoId(`https://www.youtube.com/embed/${videoId}`)).toBe(videoId);
  });

  it("recusa links que não representam um vídeo válido do YouTube", () => {
    expect(getYouTubeVideoId("https://example.com/video/dQw4w9WgXcQ")).toBeNull();
    expect(getYouTubeVideoId("https://www.youtube.com/channel/SiapAI")).toBeNull();
    expect(getYouTubeVideoId("not-a-url")).toBeNull();
  });
});
