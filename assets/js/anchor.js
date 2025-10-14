// Wait for the page to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Select all headers within the main article content
    const headers = document.querySelectorAll('article h2, article h3, article h4, article h5, article h6');

    headers.forEach(header => {
        // Check if the header has an ID (Jekyll creates these automatically)
        if (header.id) {
            // Create a new anchor link element
            const anchorLink = document.createElement('a');
            anchorLink.className = 'anchor-link';
            anchorLink.href = '#' + header.id;
            anchorLink.innerHTML = '#'; // This is the symbol that will appear
            anchorLink.setAttribute('aria-label', 'Link to this section');
            
            // Add the anchor link to the header
            header.appendChild(anchorLink);
        }
    });
});