# UniXsport - University Smart Gym & Sports Equipment Management System

A complete responsive frontend system with **Student Side**, **Storekeeper/Sport Room**, **Gym Coach**, and **Admin** modules.

## Modules

### 1. Student Side (`index.html`)

**Features:**
- **Dashboard** - Overview cards (Upcoming Sessions, Workout Plan, Pending Requests, Borrowed Equipment) + recent notifications
- **My Profile** - View student info with profile photo
- **Edit Profile** - Full form with validation, password change, photo upload
- **Request Gym Schedule** - Form with date, time slot, coach selection
- **My Schedule** - Color-coded schedule cards (Pending/Approved/Rejected)
- **My Workout Plan** - Weekly plan with exercises, sets/reps, coach notes
- **Equipment Availability** - Searchable equipment grid
- **Request Equipment** - Form with quantity validation and confirmation modal
- **Borrow History** - Searchable history with status badges

### 2. Storekeeper/Sport Room (`storekeeper.html`)

**Features:**
- **Dashboard** - Overview cards (Total Categories, Available Items, Pending Requests, Today's Issues)
- **RFID Scan / Take & Return** - Complete workflow:
  - Step 1: Scan Student RFID (with manual entry option, auto-opens Student Activity Page)
  - Step 2: Scan Equipment Category RFID
  - Step 3: Quantity input modal for each equipment
  - Step 4: Session summary with multiple items
  - Step 5: Submit session (updates stock & borrow history)
- **Equipment Stock Management** - Table view with search, add/edit equipment, real-time stock updates
- **Borrow History** - Filterable table (by student, equipment, date range, status)
- **Notifications** - Tabbed view (All, Pending Requests, Low Stock, Activity)

### 3. Gym Coach (`coach.html`)

**Features:**
- **Dashboard** - Overview cards (Pending Requests, Approved Today, Total Students, Upcoming Sessions) + recent activity feed
- **Pending Requests** - Table view with:
  - Student Name, ID, Preferred Date/Time
  - **Slot Availability Indicator** (shows X/30 students, color-coded: Available/Warning/Full)
  - Approve/Reject buttons with modals
  - Search and filter by date/time slot
- **Approval Modal**:
  - Student information display
  - **Dynamic slot availability check** (prevents approval if slot is full - 30/30)
  - Required coach comment field
  - **PDF schedule upload** (required, max 5MB, validates file type)
  - Shows alternative suggestions if slot is full
- **Rejection Modal**:
  - Student information display
  - Required rejection reason comment
- **Request History** - Filterable table showing:
  - All approved/rejected requests
  - Coach comments
  - Schedule PDF links
  - Filter by status, date range, student name
- **Schedule Calendar** - Weekly view showing:
  - All time slots (06:00-20:00)
  - Student count per slot (X/30)
  - Color-coded availability (Available/Warning/Full)
  - Navigate between weeks
- **Real-time Updates** - Dashboard and badges update automatically after approval/rejection

### 4. Admin (`admin.html`)

**Features:**
- **Dashboard** - Overview cards (Total Students, Total Coaches, Total Equipment, Equipment Status Breakdown) + quick links + recent notices
- **User Management** - Tabs for Students/Coaches:
  - Add/Edit/Delete users
  - Search by name or email
  - Role badges, RFID code display
- **Equipment Management** - Full CRUD:
  - Add/Edit/Delete equipment
  - Filter by status (Available/Borrowed/Damaged) and sports room
  - Search by name
  - Color-coded status badges
- **Notices & Broadcasts** - Create and manage notices:
  - Title, message, visible to (All/Students/Coaches)
  - Priority (Normal/High/Urgent)
  - Delete notices
- **Admin Profile** - View/edit profile, change password, upload photo

## Tech Stack

- Pure HTML, CSS, JavaScript (no frameworks)
- Font Awesome icons
- Google Fonts (Outfit, Space Grotesk)
- CSS Grid & Flexbox for responsive layouts
- LocalStorage for data persistence (Student Side)

## How to Run

1. **Student Side**: Open `index.html` in a web browser
2. **Storekeeper Side**: Open `storekeeper.html` in a web browser
3. **Gym Coach**: Open `coach.html` in a web browser
4. **Admin**: Open `admin.html` in a web browser
5. Or use a local server: `npx serve .` (then navigate to respective HTML files)

## Project Structure

```
UniXsport/
├── index.html              # Student Side (all pages)
├── storekeeper.html         # Storekeeper Side (all pages)
├── coach.html              # Gym Coach Dashboard (all pages)
├── admin.html              # Admin Dashboard (all pages)
├── css/
│   ├── styles.css          # Student Side styles
│   ├── storekeeper.css     # Storekeeper Side styles
│   ├── coach.css           # Gym Coach styles
│   └── admin.css           # Admin styles
├── js/
│   ├── app.js              # Student Side JavaScript
│   ├── storekeeper.js      # Storekeeper Side JavaScript
│   ├── coach.js            # Gym Coach JavaScript
│   └── admin.js            # Admin JavaScript
└── README.md
```

## Key Features

### Student Side
- Profile management with localStorage persistence
- Form validation
- Responsive card-based layouts
- Interactive navigation

### Storekeeper Side
- RFID scanning simulation (manual input + dropdown selection)
- Auto-opens Student Activity Page when RFID is scanned
- Real-time stock updates
- Session management (multiple items per student)
- Popup modals for quantity input
- Prevent double scanning
- Low stock alerts
- Comprehensive filtering and search

### Gym Coach Side
- **Slot Availability Management**: Maximum 30 students per time slot enforced
- **Automatic Validation**: Prevents approval if slot is full, shows availability in real-time
- **PDF Schedule Upload**: Required for approvals, validates file type and size
- **Coach Comments**: Required feedback for both approvals and rejections
- **Request History**: Complete audit trail with filters and search
- **Schedule Calendar**: Visual weekly view of slot occupancy
- **Real-time Updates**: Dashboard and badges update automatically

### Admin Side
- **User Management**: Full CRUD for students and coaches
- **Equipment Management**: Full CRUD with room assignment
- **Notices & Broadcasts**: Create, publish, delete notices
- **Admin Profile**: Edit profile, change password, photo upload
- **Dashboard**: System-wide statistics and quick navigation

## Responsive Breakpoints

- **Desktop**: Full sidebar, multi-column grids
- **Tablet**: 2-column layouts, collapsible sidebar
- **Mobile**: Single-column, stacked cards, hamburger menu
