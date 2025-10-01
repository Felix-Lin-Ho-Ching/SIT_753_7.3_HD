// Form validation for feedback.html
document.addEventListener("DOMContentLoaded", function () {
    const queryForm = document.getElementById('queryForm');
    const error = document.getElementById('error');

    if (queryForm) {
        queryForm.addEventListener('submit', function (e) {
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const query = document.getElementById('query').value.trim();

            error.innerHTML = ''; // Reset error display
            let messages = [];

            if (name === '') messages.push('Name is required.');
            if (!email.includes('@')) messages.push('Valid email is required.');
            if (!/^\d+$/.test(phone) || phone.length > 12) messages.push('Phone number must be digits and ≤ 12 digits.');
            if (query === '') messages.push('Query cannot be empty.');

            if (messages.length > 0) {
                e.preventDefault();
                error.innerHTML = messages.map(msg => `<p>${msg}</p>`).join('');
            }
        });
    }

    // Greeting Message for most pages
    const section = document.querySelector('section');
    if (section) {
        const hour = new Date().getHours();
        let greeting;
        if (hour < 12) greeting = "Good Morning!";
        else if (hour < 18) greeting = "Good Afternoon!";
        else greeting = "Good Evening!";

        const greetElem = document.createElement('h5');
        greetElem.className = "text-muted";
        greetElem.textContent = greeting + " Welcome to AIMarketer.";
        section.insertBefore(greetElem, section.firstChild);
    }

    // Footer Last Updated Date
    const footerDate = document.getElementById("lastUpdated");
    if (footerDate) {
        footerDate.textContent = "Last updated: " + new Date().toLocaleDateString();
    }
});


