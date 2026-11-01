import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { copyServices } from "@/lib/site-data";

export function HorizontalServices() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const x = useTransform(scrollYProgress, [0, 1], ["4%", "-48%"]);

  return (
    <div ref={ref} className="overflow-hidden py-4">
      <motion.div style={reduce ? {} : { x }} className={`flex gap-5 ${reduce ? "flex-wrap px-5" : "w-max pl-5 md:pl-8"}`}>
        {copyServices.map((s, i) => (
          <div
            key={s.name}
            className={`group flex h-72 w-[19rem] shrink-0 flex-col justify-between rounded-3xl border p-7 transition-transform duration-500 hover:-translate-y-1 md:w-[23rem] ${
              i % 3 === 1 ? "border-transparent bg-copper-soft" : "border-navy-100 bg-card shadow-soft"
            }`}
          >
            <span className="font-serif text-sm text-navy-500">0{i + 1}</span>
            <div>
              <h3 className="text-2xl leading-tight text-navy">{s.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-navy-500">{s.detail}</p>
              <p className="mt-5 inline-block border-t border-navy-200 pt-3 font-serif text-lg text-copper-hover">{s.price}</p>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
