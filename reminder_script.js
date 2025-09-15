document.addEventListener('DOMContentLoaded', function () {
    // Initialize sections from localStorage
    initializeSections();

    // Set up event listeners for all sections
    document.querySelectorAll('.section').forEach(section => {
        setupSection(section);
    });

    // Check timers every second
    setInterval(checkTimers, 1000);
});

function setupSection(section) {
    const header = section.querySelector('.header');
    const colorPickerBtn = header.querySelector('.color-picker-btn');
    const colorPicker = header.querySelector('.color-picker');
    const addRowBtn = header.querySelector('.add-row-btn');
    const tableBody = section.querySelector('tbody');
    const sectionTitle = header.querySelector('.section-title');

    // Load section data from localStorage
    const sectionId = Array.from(document.querySelectorAll('.section')).indexOf(section);
    const savedData = JSON.parse(localStorage.getItem(`section-${sectionId}`)) || {};

    if (savedData.title) {
        sectionTitle.value = savedData.title;
    }

    if (savedData.headerColor) {
        header.style.backgroundColor = savedData.headerColor;
    }

    if (savedData.rows) {
        savedData.rows.forEach(rowData => {
            addTableRow(tableBody, rowData.loadNumber, rowData.timerEnd, rowData.isBlinking);
        });
    }

    // Color picker functionality (now only applies to header)
    colorPickerBtn.addEventListener('click', () => {
        colorPicker.click();
    });

    colorPicker.addEventListener('input', () => {
        header.style.backgroundColor = colorPicker.value;
        saveSectionData(section);
    });

    // Add row button
    addRowBtn.addEventListener('click', () => {
        openTimerModal((loadNumber, date, time) => {
            const timerEnd = new Date(`${date}T${time}`).getTime();
            addTableRow(tableBody, loadNumber, timerEnd);
            saveSectionData(section);
        });
    });

    // Save title changes
    sectionTitle.addEventListener('change', () => {
        saveSectionData(section);
    });
}

function addTableRow(tableBody, loadNumber, timerEnd, isBlinking = false) {
    const row = document.createElement('tr');
    row.dataset.timerEnd = timerEnd;

    if (isBlinking) {
        row.classList.add('blinking');
    }

    // Load number cell
    const loadCell = document.createElement('td');
    loadCell.className = 'load-number';
    loadCell.textContent = loadNumber;
    loadCell.addEventListener('click', () => {
        navigator.clipboard.writeText(loadNumber);
        alert(`Copied: ${loadNumber}`);
    });

    // Timer cell
    const timerCell = document.createElement('td');
    const timerDisplay = document.createElement('div');
    timerDisplay.className = 'timer-display';

    const timerSpan = document.createElement('span');
    timerSpan.className = 'countdown';
    updateTimerDisplay(timerSpan, timerEnd);

    const timerBtn = document.createElement('button');
    timerBtn.className = 'timer-btn';
    timerBtn.innerHTML = '<i class="far fa-clock"></i>';
    timerBtn.addEventListener('click', () => {
        openTimerModal((newLoadNumber, date, time) => {
            const newTimerEnd = new Date(`${date}T${time}`).getTime();

            // Update row data
            row.dataset.timerEnd = newTimerEnd;
            loadCell.textContent = newLoadNumber;

            // Update blinking status
            row.classList.remove('blinking');
            if (newTimerEnd <= Date.now()) {
                row.classList.add('blinking');
            }

            // Save changes
            const section = tableBody.closest('.section');
            saveSectionData(section);
        }, timerEnd, loadNumber);
    });

    timerDisplay.appendChild(timerSpan);
    timerDisplay.appendChild(timerBtn);
    timerCell.appendChild(timerDisplay);

    // Delete cell
    const deleteCell = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.addEventListener('click', () => {
        row.remove();
        const section = tableBody.closest('.section');
        saveSectionData(section);
    });
    deleteCell.appendChild(deleteBtn);

    // Assemble row
    row.appendChild(loadCell);
    row.appendChild(timerCell);
    row.appendChild(deleteCell);
    tableBody.appendChild(row);

    return row;
}

function openTimerModal(callback, existingTime = null, existingLoadNumber = '') {
    const modal = document.getElementById('timerModal');
    const closeBtn = document.querySelector('.close-modal');
    const confirmBtn = document.getElementById('confirmTimer');

    // Set existing values if provided
    document.getElementById('loadNumber').value = existingLoadNumber;

    if (existingTime) {
        const date = new Date(existingTime);
        document.getElementById('timerDate').value = date.toISOString().split('T')[0];
        document.getElementById('timerTime').value = date.toTimeString().substring(0, 5);
    } else {
        // Default to current time + 1 hour
        const now = new Date();
        now.setHours(now.getHours() + 1);
        document.getElementById('timerDate').value = now.toISOString().split('T')[0];
        document.getElementById('timerTime').value = now.toTimeString().substring(0, 5);
    }

    modal.style.display = 'block';

    closeBtn.onclick = function () {
        modal.style.display = 'none';
    }

    confirmBtn.onclick = function () {
        const loadNumber = document.getElementById('loadNumber').value;
        const date = document.getElementById('timerDate').value;
        const time = document.getElementById('timerTime').value;

        if (loadNumber && date && time) {
            callback(loadNumber, date, time);
            modal.style.display = 'none';
        } else {
            alert('Please fill all fields');
        }
    }

    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }
}

function updateTimerDisplay(element, timerEnd) {
    const now = Date.now();
    const remaining = timerEnd - now;

    if (remaining <= 0) {
        element.textContent = '00:00:00';
        element.className = 'countdown due';
    } else {
        // Calculate days, hours, minutes, seconds
        const seconds = Math.floor(remaining / 1000);
        const days = Math.floor(seconds / (3600 * 24));
        const hours = Math.floor((seconds % (3600 * 24)) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        // Format as HH:MM:SS or D:HH:MM:SS if days > 0
        let timeStr = '';
        if (days > 0) {
            timeStr = `${days}d ${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        element.textContent = timeStr;
        element.className = 'countdown';

        // Change color if less than 1 hour remaining
        if (hours < 1) {
            element.classList.add('due');
        }
    }
}

function checkTimers() {
    document.querySelectorAll('.countdown').forEach(element => {
        const row = element.closest('tr');
        const timerEnd = parseInt(row.dataset.timerEnd);

        // Update the display
        updateTimerDisplay(element, timerEnd);

        // Toggle blinking class if due
        if (timerEnd <= Date.now()) {
            row.classList.add('blinking');
        } else {
            row.classList.remove('blinking');
        }
    });
}

function saveSectionData(section) {
    const sectionId = Array.from(document.querySelectorAll('.section')).indexOf(section);
    const header = section.querySelector('.header');
    const title = section.querySelector('.section-title').value;
    const headerColor = header.style.backgroundColor;

    const rows = [];
    section.querySelectorAll('tbody tr').forEach(row => {
        const loadNumber = row.querySelector('.load-number').textContent;
        const timerEnd = row.dataset.timerEnd;
        const isBlinking = row.classList.contains('blinking');

        rows.push({
            loadNumber,
            timerEnd,
            isBlinking
        });
    });

    const sectionData = {
        title,
        headerColor,
        rows
    };

    localStorage.setItem(`section-${sectionId}`, JSON.stringify(sectionData));
}

function initializeSections() {
    // Check if this is the first load
    const hasData = localStorage.getItem('section-0') !== null;

    if (!hasData) {
        // Create some sample data for demonstration
        const now = new Date();
        const futureTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now

        const sampleData = {
            title: "Urgent Loads",
            headerColor: "#ffe6e6",
            rows: [
                {
                    loadNumber: "30000180999",
                    timerEnd: futureTime.getTime().toString(),
                    isBlinking: false
                }
            ]
        };

        localStorage.setItem('section-0', JSON.stringify(sampleData));
    }
}