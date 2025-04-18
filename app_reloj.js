// Variables globales
let currentEmployeeId = null;
let currentConfirmCallback = null;
let employeesData = [];
let recordsData = [];
const DEFAULT_ADMIN_CODE = '691015';
let systemSettings = {
    adminCode: DEFAULT_ADMIN_CODE,
    enableBackup: true,
    backupFrequency: 'weekly',
    lastBackup: null
};

// Inicialización cuando el DOM está cargado
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);
    
    initDatabase().then(() => {
        loadSettings();
        
        // Eventos de la interfaz principal
        document.getElementById('configBtn').addEventListener('click', showAdminLogin);
        document.getElementById('clockInBtn').addEventListener('click', registerClockIn);
        document.getElementById('clockOutBtn').addEventListener('click', registerClockOut);
        
        // Eventos del modal de administrador
        document.getElementById('cancelAdminBtn').addEventListener('click', hideAdminLogin);
        document.getElementById('loginAdminBtn').addEventListener('click', validateAdminLogin);
        
        // Eventos del panel de administración
        document.getElementById('exitAdminBtn').addEventListener('click', exitAdminPanel);
        
        // Eventos de las tabs
        document.getElementById('tab-employees').addEventListener('click', () => switchTab('employees'));
        document.getElementById('tab-records').addEventListener('click', () => switchTab('records'));
        document.getElementById('tab-reports').addEventListener('click', () => switchTab('reports'));
        document.getElementById('tab-settings').addEventListener('click', () => switchTab('settings'));
        
        // Eventos de gestión de empleados
        document.getElementById('addEmployeeBtn').addEventListener('click', showEmployeeModal);
        document.getElementById('cancelEmployeeBtn').addEventListener('click', hideEmployeeModal);
        document.getElementById('saveEmployeeBtn').addEventListener('click', saveEmployee);
        document.getElementById('generateCodeBtn').addEventListener('click', generateEmployeeCode);
        
        // Eventos de registros
        document.getElementById('filterRecordsBtn').addEventListener('click', filterRecords);
        
        // Eventos de reportes
        document.getElementById('reportPeriod').addEventListener('change', toggleCustomDateRange);
        document.getElementById('generateReportBtn').addEventListener('click', generateReport);
        document.getElementById('downloadCsvBtn').addEventListener('click', downloadReportCsv);
        document.getElementById('downloadPdfBtn').addEventListener('click', downloadReportPdf);
        
        // Eventos de configuración
        document.getElementById('saveSecurityBtn').addEventListener('click', saveSecuritySettings);
        document.getElementById('backupNowBtn').addEventListener('click', createBackupNow);
        document.getElementById('restoreBackupBtn').addEventListener('click', showRestoreBackup);
        document.getElementById('resetDataBtn').addEventListener('click', showResetConfirmation);
        
        // Eventos de confirmación
        document.getElementById('cancelConfirmBtn').addEventListener('click', hideConfirmModal);
        document.getElementById('confirmActionBtn').addEventListener('click', executeConfirmAction);
        
        // Cargar datos iniciales
        loadEmployees();
        updateDatabaseStats();
        
        // Agregar empleados de ejemplo si no hay ninguno
        checkAndAddSampleData();
    });
});

// Actualizar reloj digital
function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('es-ES', { hour12: false });
    const dateString = now.toLocaleDateString('es-ES', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    document.getElementById('digital-clock').textContent = timeString;
    document.getElementById('date-display').textContent = dateString.charAt(0).toUpperCase() + dateString.slice(1);
}

// Inicializar la base de datos
async function initDatabase() {
    return new Promise((resolve, reject) => {
        // Implementación de IndexedDB
        const request = indexedDB.open('AttendanceSystem', 1);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Almacén para empleados
            if (!db.objectStoreNames.contains('employees')) {
                const employeeStore = db.createObjectStore('employees', { keyPath: 'id', autoIncrement: true });
                employeeStore.createIndex('code', 'code', { unique: true });
                employeeStore.createIndex('name', 'name', { unique: false });
            }
            
            // Almacén para registros de asistencia
            if (!db.objectStoreNames.contains('records')) {
                const recordStore = db.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
                recordStore.createIndex('employeeId', 'employeeId', { unique: false });
                recordStore.createIndex('date', 'date', { unique: false });
            }
            
            // Almacén para configuraciones
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'id' });
            }
        };
        
        request.onsuccess = (event) => {
            window.db = event.target.result;
            resolve();
        };
        
        request.onerror = (event) => {
            console.error('Error al abrir la base de datos:', event.target.error);
            reject(event.target.error);
        };
    });
}

// ----- FUNCIONES DE INTERFAZ PRINCIPAL -----

// Registrar entrada
function registerClockIn() {
    const employeeCode = document.getElementById('employeeCode').value.trim();
    
    if (!employeeCode) {
        showNotification('Por favor, ingrese un código de empleado', 'error');
        return;
    }
    
    // Verificar si el empleado existe
    const transaction = db.transaction(['employees'], 'readonly');
    const employeeStore = transaction.objectStore('employees');
    const codeIndex = employeeStore.index('code');
    const request = codeIndex.get(employeeCode);
    
    request.onsuccess = (event) => {
        const employee = event.target.result;
        
        if (!employee) {
            showNotification('Código de empleado no válido', 'error');
            return;
        }
        
        if (employee.status !== 'Activo') {
            showNotification('El empleado no está activo en el sistema', 'error');
            return;
        }
        
        // Verificar si ya hay una entrada sin salida
        checkExistingRecord(employee.id, 'in').then(exists => {
            if (exists) {
                showNotification('Ya tiene una entrada registrada hoy', 'error');
                return;
            }
            
            // Registrar entrada
            const now = new Date();
            const record = {
                employeeId: employee.id,
                employeeName: employee.name,
                date: formatDate(now),
                clockIn: formatTime(now),
                clockOut: null,
                timestamp: now.getTime()
            };
            
            const recordTransaction = db.transaction(['records'], 'readwrite');
            const recordStore = recordTransaction.objectStore('records');
            const addRequest = recordStore.add(record);
            
            addRequest.onsuccess = () => {
                showNotification(`¡Bienvenido, ${employee.name}! Entrada registrada: ${formatTime(now)}`, 'success');
                document.getElementById('employeeCode').value = '';
                document.getElementById('recentStatus').innerHTML = `
                    <div class="text-green-400 font-semibold">
                        <i class="fas fa-check-circle mr-1"></i> Entrada registrada: ${formatTime(now)}
                    </div>
                `;
            };
            
            addRequest.onerror = () => {
                showNotification('Error al registrar entrada', 'error');
            };
        });
    };
}

// Registrar salida
function registerClockOut() {
    const employeeCode = document.getElementById('employeeCode').value.trim();
    
    if (!employeeCode) {
        showNotification('Por favor, ingrese un código de empleado', 'error');
        return;
    }
    
    // Verificar si el empleado existe
    const transaction = db.transaction(['employees'], 'readonly');
    const employeeStore = transaction.objectStore('employees');
    const codeIndex = employeeStore.index('code');
    const request = codeIndex.get(employeeCode);
    
    request.onsuccess = (event) => {
        const employee = event.target.result;
        
        if (!employee) {
            showNotification('Código de empleado no válido', 'error');
            return;
        }
        
        // Buscar registro de entrada sin salida
        findOpenRecord(employee.id).then(record => {
            if (!record) {
                showNotification('No hay registro de entrada para registrar salida', 'error');
                return;
            }
            
            // Registrar salida
            const now = new Date();
            record.clockOut = formatTime(now);
            
            const recordTransaction = db.transaction(['records'], 'readwrite');
            const recordStore = recordTransaction.objectStore('records');
            const updateRequest = recordStore.put(record);
            
            updateRequest.onsuccess = () => {
                const hoursWorked = calculateHoursWorked(record.clockIn, record.clockOut);
                showNotification(`¡Hasta pronto, ${employee.name}! Salida registrada: ${formatTime(now)}`, 'success');
                document.getElementById('employeeCode').value = '';
                document.getElementById('recentStatus').innerHTML = `
                    <div class="text-red-400 font-semibold">
                        <i class="fas fa-check-circle mr-1"></i> Salida registrada: ${formatTime(now)}
                    </div>
                    <div class="text-gray-400 text-sm">
                        Horas trabajadas: ${hoursWorked}
                    </div>
                `;
            };
            
            updateRequest.onerror = () => {
                showNotification('Error al registrar salida', 'error');
            };
        });
    };
}

// ----- FUNCIONES DEL PANEL ADMINISTRATIVO -----

// Mostrar modal de login de administrador
function showAdminLogin() {
    document.getElementById('adminCode').value = '';
    document.getElementById('adminLoginModal').classList.remove('hidden');
}

// Ocultar modal de login de administrador
function hideAdminLogin() {
    document.getElementById('adminLoginModal').classList.add('hidden');
}

// Validar código de administrador
function validateAdminLogin() {
    const adminCode = document.getElementById('adminCode').value.trim();
    
    if (adminCode === systemSettings.adminCode) {
        hideAdminLogin();
        showAdminPanel();
    } else {
        showNotification('Código de administrador incorrecto', 'error');
        
        // Registrar intento fallido (podría implementarse bloqueo después de varios intentos)
        console.log('Intento fallido de acceso administrativo');
    }
}

// Mostrar panel de administración
function showAdminPanel() {
    document.getElementById('main-interface').classList.add('hidden');
    document.getElementById('configBtn').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    
    // Cargar datos para el panel
    loadEmployees();
    loadRecordsForSelect();
    updateDatabaseStats();
    switchTab('employees');
}

// Salir del panel de administración
function exitAdminPanel() {
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('main-interface').classList.remove('hidden');
    document.getElementById('configBtn').classList.remove('hidden');
}

// Cambiar entre pestañas
function switchTab(tabName) {
    // Ocultar todos los contenidos
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    
    // Desactivar todas las pestañas
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Mostrar contenido y activar pestaña seleccionada
    document.getElementById(`content-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // Acciones específicas por tab
    if (tabName === 'employees') {
        loadEmployees();
    } else if (tabName === 'records') {
        loadEmployeesForSelect();
        filterRecords();
    } else if (tabName === 'reports') {
        loadEmployeesForSelect('reportEmployee');
    } else if (tabName === 'settings') {
        loadSettingsForm();
        updateDatabaseStats();
    }
}

// ----- GESTIÓN DE EMPLEADOS -----

// Cargar lista de empleados
function loadEmployees() {
    const transaction = db.transaction(['employees'], 'readonly');
    const employeeStore = transaction.objectStore('employees');
    const request = employeeStore.getAll();
    
    request.onsuccess = (event) => {
        employeesData = event.target.result;
        renderEmployeeTable();
    };
}

// Renderizar tabla de empleados
function renderEmployeeTable() {
    const tableBody = document.getElementById('employeesTable').querySelector('tbody');
    tableBody.innerHTML = '';
    
    employeesData.forEach(employee => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${employee.id}</td>
            <td>${employee.name}</td>
            <td>${employee.department}</td>
            <td>${employee.code}</td>
            <td>
                <span class="badge ${employee.status === 'Activo' ? 'badge-success' : 'badge-danger'}">
                    ${employee.status}
                </span>
            </td>
            <td>
                <button class="edit-employee bg-blue-600 hover:bg-blue-700 text-white p-1 rounded mr-1" data-id="${employee.id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="delete-employee bg-red-600 hover:bg-red-700 text-white p-1 rounded" data-id="${employee.id}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Agregar eventos a los botones
    document.querySelectorAll('.edit-employee').forEach(button => {
        button.addEventListener('click', () => {
            const id = parseInt(button.getAttribute('data-id'));
            editEmployee(id);
        });
    });
    
    document.querySelectorAll('.delete-employee').forEach(button => {
        button.addEventListener('click', () => {
            const id = parseInt(button.getAttribute('data-id'));
            confirmDeleteEmployee(id);
        });
    });
}

// Mostrar modal de empleado
function showEmployeeModal(isEdit = false) {
    document.getElementById('employeeModalTitle').textContent = isEdit ? 'Editar Empleado' : 'Nuevo Empleado';
    
    if (!isEdit) {
        document.getElementById('employeeName').value = '';
        document.getElementById('employeeDepartment').value = 'Administración';
        document.getElementById('employeeCodeInput').value = '';
        document.getElementById('employeeStatus').value = 'Activo';
        document.getElementById('employeeId').value = '';
        
        // Generar código automáticamente para nuevos empleados
        generateEmployeeCode();
    }
    
    document.getElementById('employeeModal').classList.remove('hidden');
}

// Ocultar modal de empleado
function hideEmployeeModal() {
    document.getElementById('employeeModal').classList.add('hidden');
}

// Editar empleado
function editEmployee(id) {
    const employee = employeesData.find(emp => emp.id === id);
    
    if (employee) {
        document.getElementById('employeeName').value = employee.name;
        document.getElementById('employeeDepartment').value = employee.department;
        document.getElementById('employeeCodeInput').value = employee.code;
        document.getElementById('employeeStatus').value = employee.status;
        document.getElementById('employeeId').value = employee.id;
        
        showEmployeeModal(true);
    }
}

// Guardar empleado (nuevo o editado)
function saveEmployee() {
    const name = document.getElementById('employeeName').value.trim();
    const department = document.getElementById('employeeDepartment').value;
    const code = document.getElementById('employeeCodeInput').value.trim();
    const status = document.getElementById('employeeStatus').value;
    const idInput = document.getElementById('employeeId').value;
    
    if (!name || !code) {
        showNotification('Nombre y código son obligatorios', 'error');
        return;
    }
    
    const employee = {
        name,
        department,
        code,
        status
    };
    
    const transaction = db.transaction(['employees'], 'readwrite');
    const employeeStore = transaction.objectStore('employees');
    
    // Verificar si el código ya existe (para nuevos empleados)
    if (!idInput) {
        const codeIndex = employeeStore.index('code');
        const request = codeIndex.get(code);
        
        request.onsuccess = (event) => {
            if (event.target.result) {
                showNotification('El código de empleado ya existe', 'error');
                return;
            }
            
            // Agregar nuevo empleado
            const addRequest = employeeStore.add(employee);
            
            addRequest.onsuccess = () => {
                hideEmployeeModal();
                loadEmployees();
                showNotification('Empleado agregado con éxito', 'success');
            };
        };
    } else {
        // Editar empleado existente
        const id = parseInt(idInput);
        employee.id = id;
        
        const putRequest = employeeStore.put(employee);
        
        putRequest.onsuccess = () => {
            hideEmployeeModal();
            loadEmployees();
            showNotification('Empleado actualizado con éxito', 'success');
        };
    }
}

// Confirmar eliminación de empleado
function confirmDeleteEmployee(id) {
    const employee = employeesData.find(emp => emp.id === id);
    
    if (employee) {
        document.getElementById('confirmMessage').textContent = `¿Está seguro de que desea eliminar al empleado "${employee.name}"?`;
        currentEmployeeId = id;
        currentConfirmCallback = deleteEmployee;
        document.getElementById('confirmModal').classList.remove('hidden');
    }
}

// Eliminar empleado
function deleteEmployee() {
    if (!currentEmployeeId) return;
    
    const transaction = db.transaction(['employees'], 'readwrite');
    const employeeStore = transaction.objectStore('employees');
    const request = employeeStore.delete(currentEmployeeId);
    
    request.onsuccess = () => {
        loadEmployees();
        showNotification('Empleado eliminado con éxito', 'success');
    };
    
    currentEmployeeId = null;
}

// Generar código de empleado aleatorio
function generateEmployeeCode() {
    // Generar un código aleatorio de 6 dígitos
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('employeeCodeInput').value = randomCode;
}

// ----- GESTIÓN DE REGISTROS -----

// Cargar empleados para el selector
function loadEmployeesForSelect(elementId = 'recordEmployee') {
    const select = document.getElementById(elementId);
    
    // Mantener la opción "Todos los empleados"
    select.innerHTML = '<option value="all">Todos los empleados</option>';
    
    const transaction = db.transaction(['employees'], 'readonly');
    const employeeStore = transaction.objectStore('employees');
    const request = employeeStore.getAll();
    
    request.onsuccess = (event) => {
        event.target.result.forEach(employee => {
            const option = document.createElement('option');
            option.value = employee.id;
            option.textContent = `${employee.name} (${employee.code})`;
            select.appendChild(option);
        });
    };
}

// Cargar registros en selector de empleados
function loadRecordsForSelect() {
    loadEmployeesForSelect();
    
    // Establecer fechas predeterminadas (último mes)
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    document.getElementById('recordDateFrom').value = formatDate(lastMonth);
    document.getElementById('recordDateTo').value = formatDate(today);
}

// Filtrar registros de asistencia
function filterRecords() {
    const employeeId = document.getElementById('recordEmployee').value;
    const dateFrom = document.getElementById('recordDateFrom').value;
    const dateTo = document.getElementById('recordDateTo').value;
    
    const transaction = db.transaction(['records'], 'readonly');
    const recordStore = transaction.objectStore('records');
    const request = recordStore.getAll();
    
    request.onsuccess = (event) => {
        let records = event.target.result;
        
        // Filtrar por empleado si no es "todos"
        if (employeeId !== 'all') {
            records = records.filter(record => record.employeeId === parseInt(employeeId));
        }
        
        // Filtrar por rango de fechas
        if (dateFrom) {
            records = records.filter(record => record.date >= dateFrom);
        }
        
        if (dateTo) {
            records = records.filter(record => record.date <= dateTo);
        }
        
        // Ordenar por fecha descendente
        records.sort((a, b) => {
            if (a.date === b.date) {
                return a.clockIn.localeCompare(b.clockIn);
            }
            return b.date.localeCompare(a.date);
        });
        
        recordsData = records;
        renderRecordsTable();
    };
}

// Renderizar tabla de registros
function renderRecordsTable() {
    const tableBody = document.getElementById('recordsTable').querySelector('tbody');
    tableBody.innerHTML = '';
    
    recordsData.forEach(record => {
        const row = document.createElement('tr');
        
        const hoursWorked = record.clockOut ? calculateHoursWorked(record.clockIn, record.clockOut) : '—';
        
        row.innerHTML = `
            <td>${record.employeeName || 'Desconocido'}</td>
            <td>${formatDateDisplay(record.date)}</td>
            <td>${record.clockIn}</td>
            <td>${record.clockOut || '—'}</td>
            <td>${hoursWorked}</td>
        `;
        
        tableBody.appendChild(row);
    });
    
    if (recordsData.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="5" class="text-center py-4 text-gray-400">
                No hay registros disponibles con los filtros actuales
            </td>
        `;
        tableBody.appendChild(row);
    }
}

// ----- GESTIÓN DE REPORTES -----

// Mostrar/ocultar rango de fechas personalizado
function toggleCustomDateRange() {
    const period = document.getElementById('reportPeriod').value;
    const customDateRange = document.getElementById('customDateRange');
    
    if (period === 'custom') {
        customDateRange.classList.remove('hidden');
        
        // Establecer fechas predeterminadas (último mes)
        const today = new Date();
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        
        document.getElementById('reportDateFrom').value = formatDate(lastMonth);
        document.getElementById('reportDateTo').value = formatDate(today);
    } else {
        customDateRange.classList.add('hidden');
    }
}

// Generar reporte
function generateReport() {
    const reportType = document.getElementById('reportType').value;
    const employeeId = document.getElementById('reportEmployee').value;
    const period = document.getElementById('reportPeriod').value;
    
    let dateFrom, dateTo;
    
    // Determinar rango de fechas
    if (period === 'custom') {
        dateFrom = document.getElementById('reportDateFrom').value;
        dateTo = document.getElementById('reportDateTo').value;
        
        if (!dateFrom || !dateTo) {
            showNotification('Por favor, seleccione el rango de fechas', 'error');
            return;
        }
    } else {
        const now = new Date();
        dateTo = formatDate(now);
        
        if (period === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            dateFrom = formatDate(weekAgo);
        } else if (period === 'month') {
            const monthAgo = new Date();
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            dateFrom = formatDate(monthAgo);
        }
    }
    
    // Obtener registros
    const transaction = db.transaction(['records'], 'readonly');
    const recordStore = transaction.objectStore('records');
    const request = recordStore.getAll();
    
    request.onsuccess = (event) => {
        let records = event.target.result;
        
        // Filtrar por empleado si no es "todos"
        if (employeeId !== 'all') {
            records = records.filter(record => record.employeeId === parseInt(employeeId));
        }
        
        // Filtrar por rango de fechas
        records = records.filter(record => record.date >= dateFrom && record.date <= dateTo);
        
        // Generar reporte según tipo
        if (records.length === 0) {
            showNotification('No hay datos disponibles para generar el reporte', 'error');
            document.getElementById('reportSummary').innerHTML = `
                <p class="text-gray-400">No hay datos disponibles con los filtros seleccionados</p>
            `;
            document.getElementById('reportChart').innerHTML = `
                <p class="text-gray-400">No hay datos para mostrar en la gráfica</p>
            `;
            return;
        }
        
        // Generar datos según tipo de reporte
        if (reportType === 'attendance') {
            generateAttendanceReport(records, employeeId);
        } else if (reportType === 'hours') {
            generateHoursReport(records, employeeId);
        } else if (reportType === 'tardiness') {
            generateTardinessReport(records, employeeId);
        }
    };
}

// Generar reporte de asistencia
function generateAttendanceReport(records, employeeId) {
    // Contar días trabajados por empleado
    const employeeAttendance = {};
    const employeeNames = {};
    
    records.forEach(record => {
        if (!employeeAttendance[record.employeeId]) {
            employeeAttendance[record.employeeId] = 0;
            employeeNames[record.employeeId] = record.employeeName || 'Desconocido';
        }
        
        // Contar solo una vez por día
        if (record.clockIn) {
            employeeAttendance[record.employeeId]++;
        }
    });
    
    // Generar resumen
    let summaryHTML = `
        <h3 class="text-lg font-semibold mb-2">Reporte de Asistencia</h3>
        <div class="mb-2">
            <span class="font-medium">Periodo:</span> 
            ${formatDateDisplay(document.getElementById('reportDateFrom').value || '')} - 
            ${formatDateDisplay(document.getElementById('reportDateTo').value || '')}
        </div>
    `;
    
    if (employeeId !== 'all') {
        const name = employeeNames[parseInt(employeeId)] || 'Desconocido';
        const days = employeeAttendance[parseInt(employeeId)] || 0;
        
        summaryHTML += `
            <div class="mb-2">
                <span class="font-medium">Empleado:</span> ${name}
            </div>
            <div class="mb-2">
                <span class="font-medium">Días trabajados:</span> ${days}
            </div>
        `;
    } else {
        summaryHTML += `
            <div class="mb-2">
                <span class="font-medium">Total de empleados:</span> ${Object.keys(employeeAttendance).length}
            </div>
            <table class="w-full mt-2">
                <thead>
                    <tr>
                        <th class="text-left">Empleado</th>
                        <th class="text-right">Días trabajados</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        Object.keys(employeeAttendance).forEach(id => {
            summaryHTML += `
                <tr>
                    <td>${employeeNames[id]}</td>
                    <td class="text-right">${employeeAttendance[id]}</td>
                </tr>
            `;
        });
        
        summaryHTML += `
                </tbody>
            </table>
        `;
    }
    
    document.getElementById('reportSummary').innerHTML = summaryHTML;
    
    // Simulación de gráfica (en una implementación real usaría una librería como Chart.js)
    let chartHTML = '';
    
    if (employeeId !== 'all') {
        chartHTML = `<div class="flex items-end h-full p-4">
            <div class="w-full text-center">
                <div class="bg-blue-600 mx-auto" style="height: ${Math.min(employeeAttendance[parseInt(employeeId)] * 20, 180)}px; width: 60px;"></div>
                <div class="mt-2">${employeeNames[parseInt(employeeId)]}</div>
            </div>
        </div>`;
    } else {
        chartHTML = `<div class="flex items-end h-full p-4">`;
        
        Object.keys(employeeAttendance).forEach(id => {
            const name = employeeNames[id];
            const days = employeeAttendance[id];
            const height = Math.min(days * 20, 180);
            
            chartHTML += `
                <div class="flex-1 text-center">
                    <div class="bg-blue-600 mx-auto" style="height: ${height}px; width: 40px;"></div>
                    <div class="mt-2 text-xs">${name.split(' ')[0]}</div>
                </div>
            `;
        });
        
        chartHTML += `</div>`;
    }
    
    document.getElementById('reportChart').innerHTML = chartHTML;
}

// Generar reporte de horas trabajadas
function generateHoursReport(records, employeeId) {
    // Calcular horas trabajadas por empleado
    const employeeHours = {};
    const employeeNames = {};
    
    records.forEach(record => {
        if (!employeeHours[record.employeeId]) {
            employeeHours[record.employeeId] = 0;
            employeeNames[record.employeeId] = record.employeeName || 'Desconocido';
        }
        
        // Sumar horas trabajadas si hay entrada y salida
        if (record.clockIn && record.clockOut) {
            const hours = parseFloat(calculateHoursWorked(record.clockIn, record.clockOut));
            employeeHours[record.employeeId] += hours;
        }
    });
    
    // Generar resumen
    let summaryHTML = `
        <h3 class="text-lg font-semibold mb-2">Reporte de Horas Trabajadas</h3>
        <div class="mb-2">
            <span class="font-medium">Periodo:</span> 
            ${formatDateDisplay(document.getElementById('reportDateFrom').value || '')} - 
            ${formatDateDisplay(document.getElementById('reportDateTo').value || '')}
        </div>
    `;
    
    if (employeeId !== 'all') {
        const name = employeeNames[parseInt(employeeId)] || 'Desconocido';
        const hours = employeeHours[parseInt(employeeId)] || 0;
        
        summaryHTML += `
            <div class="mb-2">
                <span class="font-medium">Empleado:</span> ${name}
            </div>
            <div class="mb-2">
                <span class="font-medium">Total horas trabajadas:</span> ${hours.toFixed(2)}
            </div>
        `;
    } else {
        summaryHTML += `
            <div class="mb-2">
                <span class="font-medium">Total de empleados:</span> ${Object.keys(employeeHours).length}
            </div>
            <table class="w-full mt-2">
                <thead>
                    <tr>
                        <th class="text-left">Empleado</th>
                        <th class="text-right">Horas trabajadas</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        Object.keys(employeeHours).forEach(id => {
            summaryHTML += `
                <tr>
                    <td>${employeeNames[id]}</td>
                    <td class="text-right">${employeeHours[id].toFixed(2)}</td>
                </tr>
            `;
        });
        
        summaryHTML += `
                </tbody>
            </table>
        `;
    }
    
    document.getElementById('reportSummary').innerHTML = summaryHTML;
    
    // Simulación de gráfica
    let chartHTML = '';
    
    if (employeeId !== 'all') {
        chartHTML = `<div class="flex items-end h-full p-4">
            <div class="w-full text-center">
                <div class="bg-green-600 mx-auto" style="height: ${Math.min(employeeHours[parseInt(employeeId)] * 5, 180)}px; width: 60px;"></div>
                <div class="mt-2">${employeeNames[parseInt(employeeId)]}</div>
            </div>
        </div>`;
    } else {
        chartHTML = `<div class="flex items-end h-full p-4">`;
        
        Object.keys(employeeHours).forEach(id => {
            const name = employeeNames[id];
            const hours = employeeHours[id];
            const height = Math.min(hours * 5, 180);
            
            chartHTML += `
                <div class="flex-1 text-center">
                    <div class="bg-green-600 mx-auto" style="height: ${height}px; width: 40px;"></div>
                    <div class="mt-2 text-xs">${name.split(' ')[0]}</div>
                </div>
            `;
        });
        
        chartHTML += `</div>`;
    }
    
    document.getElementById('reportChart').innerHTML = chartHTML;
}

// Generar reporte de tardanzas
function generateTardinessReport(records, employeeId) {
    // Calcular tardanzas por empleado (entrada después de las 9:00 AM)
    const employeeTardiness = {};
    const employeeNames = {};
    const TARDINESS_HOUR = 9; // Hora límite: 9:00 AM
    
    records.forEach(record => {
        if (!employeeTardiness[record.employeeId]) {
            employeeTardiness[record.employeeId] = 0;
            employeeNames[record.employeeId] = record.employeeName || 'Desconocido';
        }
        
        // Verificar si es tardanza
        if (record.clockIn) {
            const hourMinute = record.clockIn.split(':');
            const hour = parseInt(hourMinute[0]);
            const minute = parseInt(hourMinute[1]);
            
            if (hour > TARDINESS_HOUR || (hour === TARDINESS_HOUR && minute > 0)) {
                employeeTardiness[record.employeeId]++;
            }
        }
    });
    
    // Generar resumen
    let summaryHTML = `
        <h3 class="text-lg font-semibold mb-2">Reporte de Tardanzas</h3>
        <div class="mb-2">
            <span class="font-medium">Periodo:</span> 
            ${formatDateDisplay(document.getElementById('reportDateFrom').value || '')} - 
            ${formatDateDisplay(document.getElementById('reportDateTo').value || '')}
        </div>
        <div class="mb-2">
            <span class="font-medium">Hora de referencia:</span> 9:00 AM
        </div>
    `;
    
    if (employeeId !== 'all') {
        const name = employeeNames[parseInt(employeeId)] || 'Desconocido';
        const tardiness = employeeTardiness[parseInt(employeeId)] || 0;
        
        summaryHTML += `
            <div class="mb-2">
                <span class="font-medium">Empleado:</span> ${name}
            </div>
            <div class="mb-2">
                <span class="font-medium">Total de tardanzas:</span> ${tardiness}
            </div>
        `;
    } else {
        summaryHTML += `
            <div class="mb-2">
                <span class="font-medium">Total de empleados:</span> ${Object.keys(employeeTardiness).length}
            </div>
            <table class="w-full mt-2">
                <thead>
                    <tr>
                        <th class="text-left">Empleado</th>
                        <th class="text-right">Tardanzas</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        Object.keys(employeeTardiness).forEach(id => {
            summaryHTML += `
                <tr>
                    <td>${employeeNames[id]}</td>
                    <td class="text-right">${employeeTardiness[id]}</td>
                </tr>
            `;
        });
        
        summaryHTML += `
                </tbody>
            </table>
        `;
    }
    
    document.getElementById('reportSummary').innerHTML = summaryHTML;
    
    // Simulación de gráfica
    let chartHTML = '';
    
    if (employeeId !== 'all') {
        chartHTML = `<div class="flex items-end h-full p-4">
            <div class="w-full text-center">
                <div class="bg-red-600 mx-auto" style="height: ${Math.min(employeeTardiness[parseInt(employeeId)] * 20, 180)}px; width: 60px;"></div>
                <div class="mt-2">${employeeNames[parseInt(employeeId)]}</div>
            </div>
        </div>`;
    } else {
        chartHTML = `<div class="flex items-end h-full p-4">`;
        
        Object.keys(employeeTardiness).forEach(id => {
            const name = employeeNames[id];
            const tardiness = employeeTardiness[id];
            const height = Math.min(tardiness * 20, 180);
            
            chartHTML += `
                <div class="flex-1 text-center">
                    <div class="bg-red-600 mx-auto" style="height: ${height}px; width: 40px;"></div>
                    <div class="mt-2 text-xs">${name.split(' ')[0]}</div>
                </div>
            `;
        });
        
        chartHTML += `</div>`;
    }
    
    document.getElementById('reportChart').innerHTML = chartHTML;
}

// Descargar reporte en CSV
function downloadReportCsv() {
    if (!recordsData || recordsData.length === 0) {
        showNotification('No hay datos para exportar', 'error');
        return;
    }
    
    // Crear contenido CSV
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Empleado,Fecha,Hora Entrada,Hora Salida,Horas Trabajadas\n';
    
    recordsData.forEach(record => {
        const hoursWorked = record.clockOut ? calculateHoursWorked(record.clockIn, record.clockOut) : '';
        csvContent += `${record.employeeName},${record.date},${record.clockIn},${record.clockOut || ''},${hoursWorked}\n`;
    });
    
    // Crear enlace de descarga
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'reporte_asistencia.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Descargar reporte en PDF (simulado)
function downloadReportPdf() {
    showNotification('Esta es una simulación de exportación a PDF', 'info');
    
    // En una implementación real, se utilizaría una biblioteca como jsPDF
    // para generar un PDF a partir de los datos
}

// ----- CONFIGURACIÓN DEL SISTEMA -----

// Cargar configuración en el formulario
function loadSettingsForm() {
    document.getElementById('adminCodeSetting').value = '';
    document.getElementById('enableBackup').checked = systemSettings.enableBackup;
    document.getElementById('backupFrequency').value = systemSettings.backupFrequency;
    
    if (systemSettings.lastBackup) {
        const backupDate = new Date(systemSettings.lastBackup);
        document.getElementById('lastBackupDate').textContent = backupDate.toLocaleString();
    } else {
        document.getElementById('lastBackupDate').textContent = 'Nunca';
    }
}

// Guardar configuración de seguridad
function saveSecuritySettings() {
    const adminCode = document.getElementById('adminCodeSetting').value.trim();
    const enableBackup = document.getElementById('enableBackup').checked;
    const backupFrequency = document.getElementById('backupFrequency').value;
    
    if (adminCode) {
        systemSettings.adminCode = adminCode;
    }
    
    systemSettings.enableBackup = enableBackup;
    systemSettings.backupFrequency = backupFrequency;
    
    saveSettings().then(() => {
        showNotification('Configuración guardada con éxito', 'success');
    });
}

// Crear copia de seguridad ahora
function createBackupNow() {
    // Simulación de copia de seguridad
    const now = new Date();
    systemSettings.lastBackup = now.getTime();
    
    saveSettings().then(() => {
        document.getElementById('lastBackupDate').textContent = now.toLocaleString();
        showNotification('Copia de seguridad creada con éxito', 'success');
    });
}

// Mostrar confirmación para restaurar copia de seguridad
function showRestoreBackup() {
    document.getElementById('confirmMessage').textContent = '¿Está seguro de que desea restaurar la última copia de seguridad? Esto sobrescribirá todos los datos actuales.';
    currentConfirmCallback = restoreBackup;
    document.getElementById('confirmModal').classList.remove('hidden');
}

// Restaurar copia de seguridad (simulado)
function restoreBackup() {
    // Simulación de restauración de copia de seguridad
    setTimeout(() => {
        showNotification('Copia de seguridad restaurada con éxito', 'success');
        loadEmployees();
        updateDatabaseStats();
    }, 1000);
}

// Mostrar confirmación para reiniciar el sistema
function showResetConfirmation() {
    document.getElementById('confirmMessage').textContent = '¿Está seguro de que desea reiniciar el sistema? Esto eliminará todos los datos y no se podrá deshacer.';
    currentConfirmCallback = resetSystem;
    document.getElementById('confirmModal').classList.remove('hidden');
}

// Reiniciar sistema
function resetSystem() {
    // Eliminar todos los datos excepto la configuración
    const employeeTransaction = db.transaction(['employees'], 'readwrite');
    const recordTransaction = db.transaction(['records'], 'readwrite');
    
    const employeeStore = employeeTransaction.objectStore('employees');
    const recordStore = recordTransaction.objectStore('records');
    
    const clearEmployees = employeeStore.clear();
    const clearRecords = recordStore.clear();
    
    Promise.all([
        new Promise(resolve => {
            clearEmployees.onsuccess = resolve;
        }),
        new Promise(resolve => {
            clearRecords.onsuccess = resolve;
        })
    ]).then(() => {
        showNotification('Sistema reiniciado con éxito', 'success');
        loadEmployees();
        updateDatabaseStats();
    });
}

// Actualizar estadísticas de la base de datos
function updateDatabaseStats() {
    const employeeTransaction = db.transaction(['employees'], 'readonly');
    const recordTransaction = db.transaction(['records'], 'readonly');
    
    const employeeStore = employeeTransaction.objectStore('employees');
    const recordStore = recordTransaction.objectStore('records');
    
    const employeeCount = employeeStore.count();
    const recordCount = recordStore.count();
    
    Promise.all([
        new Promise(resolve => {
            employeeCount.onsuccess = (event) => resolve(event.target.result);
        }),
        new Promise(resolve => {
            recordCount.onsuccess = (event) => resolve(event.target.result);
        })
    ]).then(([employees, records]) => {
        // Estimar tamaño aproximado (muy simplificado)
        const approxSize = (employees * 0.5 + records * 0.3).toFixed(2);
        
        document.getElementById('dbStats').innerHTML = `
            Empleados: ${employees}<br>
            Registros: ${records}<br>
            Tamaño aproximado: ${approxSize} KB
        `;
    });
}

// ----- MODAL DE CONFIRMACIÓN -----

// Ocultar modal de confirmación
function hideConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    currentConfirmCallback = null;
}

// Ejecutar acción de confirmación
function executeConfirmAction() {
    if (currentConfirmCallback) {
        currentConfirmCallback();
        hideConfirmModal();
    }
}

// ----- FUNCIONES DE CONFIGURACIÓN -----

// Cargar configuración
function loadSettings() {
    const transaction = db.transaction(['settings'], 'readonly');
    const settingsStore = transaction.objectStore('settings');
    const request = settingsStore.get('system');
    
    request.onsuccess = (event) => {
        const settings = event.target.result;
        
        if (settings) {
            systemSettings = settings.value;
        }
    };
}

// Guardar configuración
function saveSettings() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['settings'], 'readwrite');
        const settingsStore = transaction.objectStore('settings');
        
        const settings = {
            id: 'system',
            value: systemSettings
        };
        
        const request = settingsStore.put(settings);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ----- FUNCIONES AUXILIARES -----

// Mostrar notificación
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const messageElement = document.getElementById('notificationMessage');
    
    // Establecer mensaje y clase
    messageElement.textContent = message;
    
    // Establecer color según tipo
    notification.className = 'notification';
    
    if (type === 'error') {
        notification.style.backgroundColor = '#ef4444';
    } else if (type === 'success') {
        notification.style.backgroundColor = '#10b981';
    } else if (type === 'info') {
        notification.style.backgroundColor = '#3b82f6';
    } else if (type === 'warning') {
        notification.style.backgroundColor = '#f59e0b';
    }
    
    // Mostrar notificación
    notification.classList.add('show');
    
    // Ocultar después de 3 segundos
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Verificar si existe un registro para la fecha actual
function checkExistingRecord(employeeId, type) {
    return new Promise((resolve, reject) => {
        const now = new Date();
        const today = formatDate(now);
        
        const transaction = db.transaction(['records'], 'readonly');
        const recordStore = transaction.objectStore('records');
        const employeeIndex = recordStore.index('employeeId');
        const request = employeeIndex.getAll(employeeId);
        
        request.onsuccess = (event) => {
            const records = event.target.result;
            const todayRecords = records.filter(record => record.date === today);
            
            if (type === 'in') {
                // Para entrada: verificar si ya existe una entrada hoy
                resolve(todayRecords.length > 0);
            } else {
                // Para salida: verificar si existe una entrada sin salida hoy
                resolve(todayRecords.some(record => record.clockIn && !record.clockOut));
            }
        };
        
        request.onerror = () => reject(request.error);
    });
}

// Buscar registro abierto (con entrada pero sin salida)
function findOpenRecord(employeeId) {
    return new Promise((resolve, reject) => {
        const now = new Date();
        const today = formatDate(now);
        
        const transaction = db.transaction(['records'], 'readonly');
        const recordStore = transaction.objectStore('records');
        const employeeIndex = recordStore.index('employeeId');
        const request = employeeIndex.getAll(employeeId);
        
        request.onsuccess = (event) => {
            const records = event.target.result;
            const todayRecords = records.filter(record => record.date === today);
            const openRecord = todayRecords.find(record => record.clockIn && !record.clockOut);
            
            resolve(openRecord);
        };
        
        request.onerror = () => reject(request.error);
    });
}

// Formatear fecha para almacenamiento (YYYY-MM-DD)
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

// Formatear hora (HH:MM:SS)
function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${hours}:${minutes}:${seconds}`;
}

// Formatear fecha para mostrar
function formatDateDisplay(dateString) {
    if (!dateString) return '';
    
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
}

// Calcular horas trabajadas
function calculateHoursWorked(timeIn, timeOut) {
    if (!timeIn || !timeOut) return '0';
    
    const [hoursIn, minutesIn, secondsIn] = timeIn.split(':').map(Number);
    const [hoursOut, minutesOut, secondsOut] = timeOut.split(':').map(Number);
    
    let totalSeconds = 
        (hoursOut * 3600 + minutesOut * 60 + secondsOut) - 
        (hoursIn * 3600 + minutesIn * 60 + secondsIn);
    
    // Si es negativo, asumir que salió al día siguiente
    if (totalSeconds < 0) {
        totalSeconds += 24 * 3600;
    }
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    return `${hours}.${minutes < 10 ? '0' + minutes : minutes}`;
}
    
    // Actualizar interfaz
    setTimeout(() => {
        loadEmployees();
        showNotification('Se han cargado datos de ejemplo para mostrar la funcionalidad del sistema', 'info');
    }, 500);
}
