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
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
