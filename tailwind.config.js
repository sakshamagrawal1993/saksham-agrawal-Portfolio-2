/** @type {import('tailwindcss').Config} */
export default {
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
            },
            fontFamily: {
                serif: ['"Playfair Display"', 'serif'], // Assuming this is used based on previous CSS classes
                sans: ['Inter', 'sans-serif'],
            },
            typography: {
                DEFAULT: {
                    css: {
                        'ul > li': {
                            marginTop: '0em',
                            marginBottom: '0em',
                            paddingLeft: '0.5em', // Reduce gap between bullet and text
                        },
                        'ul > li > p': {
                            marginTop: '0em',
                            marginBottom: '0em',
                        },
                        'ul': {
                            marginTop: '0.5em',
                            marginBottom: '0.5em',
                        },
                        'ol > li': {
                            marginTop: '0em',
                            marginBottom: '0em',
                            paddingLeft: '0.5em', // Reduce gap between number and text
                        },
                        'ol > li > p': {
                            marginTop: '0em',
                            marginBottom: '0em',
                        },
                        'ol': {
                            marginTop: '0.5em',
                            marginBottom: '0.5em',
                        },
                        // Ensure markers (bullets/numbers) are close enough
                        'li::marker': {
                            paddingRight: '0.25em',
                        },
                        // For prose-lg specifically if needed, but DEFAULT handles most
                    },
                },
            },
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
