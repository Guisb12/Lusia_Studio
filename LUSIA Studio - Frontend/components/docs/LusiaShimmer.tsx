"use client";

import { motion } from "framer-motion";

export function LusiaShimmer() {
    return (
        <motion.div
            className="absolute inset-0 pointer-events-none overflow-hidden rounded-[inherit]"
            aria-hidden
        >
            <motion.div
                className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-brand-accent/8 to-transparent"
                animate={{ x: ["-100%", "200%"] }}
                transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    repeatDelay: 3,
                    ease: "easeInOut",
                }}
            />
        </motion.div>
    );
}
