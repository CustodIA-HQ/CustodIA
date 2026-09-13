"use client";

import { useEffect, useRef, useState } from "react";

const VIEW_W = 1448;
const VIEW_H = 1086;

/** Iris center in the shared 1448×1086 viewBox. */
const CORE_ORIGIN_X = 760;
const CORE_ORIGIN_Y = 585;
const CORE_SCALE = 0.72;
const CORE_TRANSLATE_X = 16;
const CORE_TRANSLATE_Y = -38;

/** Aperture clip, nudged down so the brow line cuts the top of the smaller iris. */
const OPENING_ORIGIN_X = 760;
const OPENING_ORIGIN_Y = 560;
const OPENING_SCALE = 1;
const OPENING_TRANSLATE_Y = 38;

const UPPER_LID_PATH =
  "M 1349.0 252.0 L 1325.0 265.0 L 1298.0 275.0 L 1235.0 289.0 L 1148.0 298.0 L 1112.0 300.0 L 1067.0 299.0 L 1150.0 266.0 L 1174.0 253.0 L 1174.0 251.0 L 1118.0 270.0 L 958.0 310.0 L 911.0 324.0 L 820.0 357.0 L 711.0 405.0 L 400.0 560.0 L 399.0 557.0 L 408.0 541.0 L 438.0 504.0 L 436.0 504.0 L 410.0 520.0 L 389.0 536.0 L 360.0 564.0 L 363.0 550.0 L 384.0 509.0 L 426.0 452.0 L 475.0 404.0 L 531.0 361.0 L 505.0 374.0 L 469.0 396.0 L 419.0 431.0 L 367.0 473.0 L 315.0 522.0 L 264.0 580.0 L 265.0 568.0 L 274.0 547.0 L 301.0 505.0 L 284.0 520.0 L 244.0 565.0 L 188.0 642.0 L 146.0 686.0 L 129.0 710.0 L 114.0 737.0 L 101.0 771.0 L 93.0 804.0 L 90.0 829.0 L 91.0 877.0 L 97.0 913.0 L 108.0 952.0 L 120.0 983.0 L 145.0 1029.0 L 148.0 1032.0 L 136.0 999.0 L 126.0 953.0 L 124.0 905.0 L 128.0 873.0 L 137.0 842.0 L 148.0 818.0 L 161.0 798.0 L 181.0 777.0 L 194.0 767.0 L 220.0 754.0 L 246.0 777.0 L 277.0 795.0 L 298.0 801.0 L 331.0 799.0 L 301.0 775.0 L 277.0 750.0 L 261.0 727.0 L 247.0 699.0 L 237.0 685.0 L 221.0 671.0 L 211.0 665.0 L 197.0 661.0 L 195.0 658.0 L 219.0 657.0 L 234.0 661.0 L 251.0 670.0 L 265.0 682.0 L 252.0 660.0 L 236.0 644.0 L 249.0 644.0 L 265.0 649.0 L 278.0 657.0 L 290.0 668.0 L 301.0 684.0 L 319.0 659.0 L 344.0 634.0 L 365.0 618.0 L 391.0 602.0 L 658.0 456.0 L 718.0 425.0 L 804.0 385.0 L 853.0 366.0 L 905.0 350.0 L 940.0 342.0 L 975.0 337.0 L 1013.0 334.0 L 1068.0 334.0 L 1154.0 340.0 L 1218.0 341.0 L 1262.0 336.0 L 1285.0 329.0 L 1237.0 329.0 L 1191.0 323.0 L 1237.0 314.0 L 1285.0 297.0 L 1330.0 270.0 Z";

const LOWER_LID_PATH =
  "M 1316.0 289.0 L 1293.0 306.0 L 1263.0 322.0 L 1208.0 343.0 L 1177.0 358.0 L 1159.0 371.0 L 1142.0 388.0 L 1115.0 427.0 L 1086.0 484.0 L 1117.0 443.0 L 1145.0 415.0 L 1183.0 387.0 L 1195.0 381.0 L 1197.0 382.0 L 1173.0 406.0 L 1140.0 449.0 L 1053.0 594.0 L 1013.0 648.0 L 982.0 679.0 L 963.0 694.0 L 946.0 705.0 L 907.0 723.0 L 863.0 736.0 L 818.0 744.0 L 794.0 746.0 L 726.0 745.0 L 666.0 734.0 L 634.0 725.0 L 593.0 710.0 L 530.0 679.0 L 483.0 648.0 L 428.0 601.0 L 378.0 630.0 L 357.0 635.0 L 335.0 645.0 L 353.0 641.0 L 384.0 641.0 L 421.0 650.0 L 442.0 660.0 L 392.0 660.0 L 367.0 665.0 L 353.0 671.0 L 407.0 671.0 L 465.0 684.0 L 540.0 713.0 L 608.0 748.0 L 668.0 785.0 L 726.0 827.0 L 764.0 859.0 L 821.0 917.0 L 794.0 880.0 L 752.0 835.0 L 716.0 803.0 L 648.0 748.0 L 656.0 749.0 L 759.0 791.0 L 829.0 813.0 L 865.0 821.0 L 909.0 827.0 L 945.0 829.0 L 980.0 828.0 L 921.0 821.0 L 876.0 810.0 L 826.0 792.0 L 790.0 773.0 L 851.0 776.0 L 922.0 771.0 L 980.0 761.0 L 1034.0 744.0 L 961.0 754.0 L 921.0 755.0 L 896.0 752.0 L 930.0 744.0 L 960.0 734.0 L 1024.0 704.0 L 1089.0 663.0 L 1188.0 594.0 L 1066.0 649.0 L 1064.0 648.0 L 1144.0 568.0 L 1180.0 536.0 L 1218.0 507.0 L 1264.0 480.0 L 1210.0 499.0 L 1158.0 523.0 L 1221.0 457.0 L 1289.0 390.0 L 1232.0 417.0 L 1206.0 432.0 L 1204.0 431.0 L 1277.0 348.0 Z";

const OPENING_PATH =
  "M 1097.0 311.0 L 1081.0 282.0 L 1014.0 283.0 L 911.0 302.0 L 778.0 346.0 L 677.0 390.0 L 588.0 439.0 L 437.0 536.0 L 348.0 602.0 L 384.0 670.0 L 425.0 722.0 L 498.0 784.0 L 567.0 821.0 L 629.0 841.0 L 695.0 851.0 L 784.0 847.0 L 869.0 824.0 L 938.0 789.0 L 998.0 743.0 L 1050.0 685.0 L 1092.0 614.0 L 1117.0 538.0 L 1126.0 460.0 L 1120.0 387.0 Z";

type Phase = "closed" | "play" | "exit";

export function FalconEyeIntro({ onDone }: { onDone?: () => void }) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(true);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const eyeParam = new URLSearchParams(window.location.search).get("eye");
    const holdOpen = eyeParam === "static";
    const holdClosed = eyeParam === "closed";
    const holdPlay = eyeParam === "hold";
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduce = motion.matches;
    setReduced(reduce || holdOpen);

    if (holdClosed) {
      return;
    }

    let raf1 = 0;
    let raf2 = 0;
    if (reduce || holdOpen) {
      setPhase("play");
    } else {
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => setPhase("play"));
      });
    }

    if (holdPlay || holdOpen) {
      return () => {
        window.cancelAnimationFrame(raf1);
        window.cancelAnimationFrame(raf2);
      };
    }

    const exitAt = reduce ? 360 : 2450;
    const goneAt = reduce ? 720 : 3060;
    const exitTimer = window.setTimeout(() => setPhase("exit"), exitAt);
    const goneTimer = window.setTimeout(() => {
      setMounted(false);
      onDoneRef.current?.();
    }, goneAt);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(exitTimer);
      window.clearTimeout(goneTimer);
    };
  }, []);

  if (!mounted) return null;

  const coreTransform = `translate(${CORE_ORIGIN_X + CORE_TRANSLATE_X} ${CORE_ORIGIN_Y + CORE_TRANSLATE_Y}) scale(${CORE_SCALE}) translate(${-CORE_ORIGIN_X} ${-CORE_ORIGIN_Y})`;

  return (
    <div
      className={[
        "falcon-eye-intro",
        `falcon-eye-intro--${phase}`,
        reduced ? "falcon-eye-intro--reduced" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      <div className="falcon-eye-intro__scrim" />
      <svg
        className="falcon-eye"
        viewBox="10 55 1350 1020"
        width={VIEW_W}
        height={VIEW_H}
        fill="none"
        preserveAspectRatio="xMidYMid meet"
        role="img"
      >
        <defs>
          <clipPath id="falcon-eye-opening" clipPathUnits="userSpaceOnUse">
            <path
              d={OPENING_PATH}
              transform={`translate(${OPENING_ORIGIN_X} ${OPENING_ORIGIN_Y + OPENING_TRANSLATE_Y}) scale(${OPENING_SCALE}) translate(${-OPENING_ORIGIN_X} ${-OPENING_ORIGIN_Y})`}
            />
          </clipPath>
          <clipPath id="falcon-eye-slit" clipPathUnits="userSpaceOnUse">
            <rect className="falcon-eye__slit" x="300" y="210" width="880" height="700" />
          </clipPath>
          <radialGradient
            id="falcon-iris-base"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(760 585) rotate(0) scale(350 270)"
          >
            <stop offset="0.00" stopColor="#7DFF5A" />
            <stop offset="0.36" stopColor="#39FF14" />
            <stop offset="0.70" stopColor="#0FAF00" />
            <stop offset="1.00" stopColor="#002300" />
          </radialGradient>
          <radialGradient
            id="falcon-iris-shade"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(635 456) rotate(0) scale(520 400)"
          >
            <stop offset="0.00" stopColor="#000000" stopOpacity="0.00" />
            <stop offset="0.60" stopColor="#000000" stopOpacity="0.00" />
            <stop offset="1.00" stopColor="#000000" stopOpacity="0.40" />
          </radialGradient>
          <radialGradient
            id="falcon-inner-light"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(720 520) rotate(0) scale(350 270)"
          >
            <stop offset="0.00" stopColor="#C8FF8C" stopOpacity="0.42" />
            <stop offset="0.38" stopColor="#6CFF38" stopOpacity="0.22" />
            <stop offset="0.72" stopColor="#39FF14" stopOpacity="0.08" />
            <stop offset="1.00" stopColor="#39FF14" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g clipPath="url(#falcon-eye-opening)">
          <g clipPath="url(#falcon-eye-slit)">
            <g className="falcon-eye__core" transform={coreTransform}>
              <defs>
                <clipPath id="falcon-green-clip">
                  <ellipse cx="760" cy="585" rx="350" ry="270" />
                </clipPath>
              </defs>
              <g clipPath="url(#falcon-green-clip)">
                <ellipse cx="760" cy="585" rx="350" ry="270" fill="url(#falcon-iris-base)" />
                <ellipse cx="760" cy="585" rx="350" ry="270" fill="url(#falcon-iris-shade)" />
                <g className="falcon-eye__highlight">
                  <ellipse cx="760" cy="585" rx="350" ry="270" fill="#8CFF55" />
                  <ellipse cx="760" cy="585" rx="350" ry="270" fill="url(#falcon-inner-light)" />
                </g>
              </g>
              <circle cx="699" cy="484" r="161" fill="#000000" />
              <ellipse
                cx="688"
                cy="451"
                rx="50"
                ry="28"
                transform="rotate(-40 688 451)"
                fill="#FFFFFF"
              />
            </g>
          </g>
        </g>

        <g className="falcon-eye__lid falcon-eye__lid--upper">
          <path d={UPPER_LID_PATH} fill="#FFFFFF" />
        </g>
        <g className="falcon-eye__lid falcon-eye__lid--lower">
          <path d={LOWER_LID_PATH} fill="#FFFFFF" />
        </g>
      </svg>
    </div>
  );
}
