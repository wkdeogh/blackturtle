import Image from "next/image";
import turtleLogo from "../../turtle.png";

type TurtleLogoProps = {
  className?: string;
  large?: boolean;
  priority?: boolean;
};

export function TurtleLogo({ className = "", large = false, priority = false }: TurtleLogoProps) {
  return (
    <span className={`turtle-logo ${large ? "large" : ""} ${className}`.trim()} aria-hidden="true">
      <Image
        src={turtleLogo}
        alt=""
        fill
        priority={priority}
        sizes={large ? "200px" : "100px"}
      />
    </span>
  );
}
