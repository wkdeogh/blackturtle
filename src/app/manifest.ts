import type { MetadataRoute } from "next";
import turtleBlackLogo from "../../turtle_black.png";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Black Turtle · Investment Desk",
    short_name: "Black Turtle",
    description: "개인용 시장·매크로·기업 모니터링 대시보드",
    start_url: "/macro",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#0c110f",
    icons: [
      {
        src: turtleBlackLogo.src,
        sizes: "1080x1080",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
