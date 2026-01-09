// Show spinner on page load
window.addEventListener('load', function() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
        spinner.style.opacity = '0';
        setTimeout(function() {
            spinner.style.display = 'none';
        }, 300);
    }
});

// Show spinner when clicking links (for navigation)
document.addEventListener('DOMContentLoaded', function() {
    const links = document.querySelectorAll('a[href]:not([href^="#"]):not([href^="javascript:"])');
    links.forEach(function(link) {
        link.addEventListener('click', function(e) {
            // Only show spinner for external/internal links, not anchors
            const href = this.getAttribute('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                const spinner = document.getElementById('loading-spinner');
                if (spinner) {
                    spinner.style.display = 'flex';
                    spinner.style.opacity = '1';
                }
            }
        });
    });

    // Also show spinner when forms are submitted
    const forms = document.querySelectorAll('form');
    forms.forEach(function(form) {
        form.addEventListener('submit', function() {
            const spinner = document.getElementById('loading-spinner');
            if (spinner) {
                spinner.style.display = 'flex';
                spinner.style.opacity = '1';
            }
        });
    });
});

