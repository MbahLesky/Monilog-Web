import animate from "tailwindcss-animate";
var config = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        container: {
            center: true,
            padding: {
                DEFAULT: "1rem",
                sm: "1.25rem",
                lg: "2rem",
                xl: "2.5rem",
                "2xl": "3rem"
            },
            screens: {
                "2xl": "1344px"
            }
        },
        extend: {
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))"
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))"
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))"
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))"
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))"
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))"
                },
                success: {
                    DEFAULT: "hsl(var(--success))",
                    foreground: "hsl(var(--success-foreground))"
                },
                warning: {
                    DEFAULT: "hsl(var(--warning))",
                    foreground: "hsl(var(--warning-foreground))"
                },
                danger: {
                    DEFAULT: "hsl(var(--danger))",
                    foreground: "hsl(var(--danger-foreground))"
                },
                surface: {
                    DEFAULT: "hsl(var(--surface))",
                    elevated: "hsl(var(--surface-elevated))",
                    tint: "hsl(var(--surface-tint))"
                }
            },
            borderRadius: {
                xl: "var(--radius-xl)",
                lg: "var(--radius-lg)",
                md: "var(--radius-md)",
                sm: "var(--radius-sm)"
            },
            fontFamily: {
                sans: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"]
            },
            boxShadow: {
                card: "0 10px 28px -18px rgba(8, 210, 181, 0.22)",
                soft: "0 8px 20px -18px rgba(2, 6, 23, 0.35)"
            },
            backgroundImage: {
                "brand-gradient": "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))",
                "soft-grid": "radial-gradient(circle at top left, rgba(8,210,181,0.12), transparent 32%), radial-gradient(circle at bottom right, rgba(8,134,127,0.18), transparent 28%), linear-gradient(transparent 31px, rgba(8,210,181,0.03) 32px), linear-gradient(90deg, transparent 31px, rgba(8,210,181,0.03) 32px)"
            },
            keyframes: {
                "fade-up": {
                    "0%": { opacity: "0", transform: "translateY(10px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" }
                },
                "pulse-soft": {
                    "0%, 100%": { opacity: "1" },
                    "50%": { opacity: "0.7" }
                }
            },
            animation: {
                "fade-up": "fade-up 420ms ease-out",
                "pulse-soft": "pulse-soft 1.8s ease-in-out infinite"
            }
        }
    },
    plugins: [animate]
};
export default config;
