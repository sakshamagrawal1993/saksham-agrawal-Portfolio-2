/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
	extend: {
		colors: {
			'brand-dark': '#2C2A26',
			'brand-light': '#F5F2EB',
			'brand-gray': '#A8A29E',
			'brand-text': '#5D5A53',
			// LibertyMD scale — mirror of design-system/design-tokens.json (libertymd.color).
			// Use e.g. bg-libertymd-blue-600, text-libertymd-slate-500, bg-libertymd-green-600.
			// Keep in sync with design-tokens.json; the design-guard treats this config as source.
			libertymd: {
				blue: {
					900: '#1E3A8A',
					800: '#1E40AF',
					700: '#1D4ED8',
					600: '#2563EB',
					500: '#3B82F6',
					50: '#EFF6FF'
				},
				slate: {
					900: '#0F172A',
					700: '#334155',
					500: '#64748B',
					300: '#CBD5E1',
					200: '#E2E8F0'
				},
				ink: '#111827',
				green: {
					600: '#169B52',
					emerald: '#10B981',
					sage: '#DDE7D8'
				},
				indigo: '#5661F6'
			},
			background: 'hsl(var(--background))',
			foreground: 'hsl(var(--foreground))',
			card: {
				DEFAULT: 'hsl(var(--card))',
				foreground: 'hsl(var(--card-foreground))'
			},
			popover: {
				DEFAULT: 'hsl(var(--popover))',
				foreground: 'hsl(var(--popover-foreground))'
			},
			primary: {
				DEFAULT: 'hsl(var(--primary))',
				foreground: 'hsl(var(--primary-foreground))'
			},
			secondary: {
				DEFAULT: 'hsl(var(--secondary))',
				foreground: 'hsl(var(--secondary-foreground))'
			},
			muted: {
				DEFAULT: 'hsl(var(--muted))',
				foreground: 'hsl(var(--muted-foreground))'
			},
			accent: {
				DEFAULT: 'hsl(var(--accent))',
				foreground: 'hsl(var(--accent-foreground))'
			},
			destructive: {
				DEFAULT: 'hsl(var(--destructive))',
				foreground: 'hsl(var(--destructive-foreground))'
			},
			border: 'hsl(var(--border))',
			input: 'hsl(var(--input))',
			ring: 'hsl(var(--ring))',
			chart: {
				'1': 'hsl(var(--chart-1))',
				'2': 'hsl(var(--chart-2))',
				'3': 'hsl(var(--chart-3))',
				'4': 'hsl(var(--chart-4))',
				'5': 'hsl(var(--chart-5))'
			}
		},
		fontFamily: {
			serif: [
				'Playfair Display',
				'serif'
			],
			sans: [
				'Inter',
				'sans-serif'
			]
		},
		// LibertyMD 4px-grid spacing, aliased to the --libertymd-space-* vars in index.css.
		// Use e.g. p-libertymd-lg, gap-libertymd-xl, mt-libertymd-section.
		spacing: {
			'libertymd-xs': 'var(--libertymd-space-xs)',
			'libertymd-sm': 'var(--libertymd-space-sm)',
			'libertymd-md': 'var(--libertymd-space-md)',
			'libertymd-lg': 'var(--libertymd-space-lg)',
			'libertymd-xl': 'var(--libertymd-space-xl)',
			'libertymd-2xl': 'var(--libertymd-space-2xl)',
			'libertymd-3xl': 'var(--libertymd-space-3xl)',
			'libertymd-section': 'var(--libertymd-space-section)'
		},
		typography: {
			DEFAULT: {
				css: {
					'ul > li': {
						marginTop: '0em',
						marginBottom: '0em',
						paddingLeft: '0.5em'
					},
					'ul > li > p': {
						marginTop: '0em',
						marginBottom: '0em'
					},
					ul: {
						marginTop: '0.5em',
						marginBottom: '0.5em'
					},
					'ol > li': {
						marginTop: '0em',
						marginBottom: '0em',
						paddingLeft: '0.5em'
					},
					'ol > li > p': {
						marginTop: '0em',
						marginBottom: '0em'
					},
					ol: {
						marginTop: '0.5em',
						marginBottom: '0.5em'
					},
					'li::marker': {
						paddingRight: '0.25em'
					}
				}
			},
			lg: {
				css: {
					'ul > li': {
						marginTop: '0em',
						marginBottom: '0em'
					},
					'ul > li > p': {
						marginTop: '0em',
						marginBottom: '0em'
					},
					'ol > li': {
						marginTop: '0em',
						marginBottom: '0em'
					},
					'ol > li > p': {
						marginTop: '0em',
						marginBottom: '0em'
					}
				}
			}
		},
		borderRadius: {
			lg: 'var(--radius)',
			md: 'calc(var(--radius) - 2px)',
			sm: 'calc(var(--radius) - 4px)'
		}
	}
    },
    plugins: [
        require('@tailwindcss/typography'),
        require("tailwindcss-animate")
    ],
}
