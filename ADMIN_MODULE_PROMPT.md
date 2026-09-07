# Admin Module Frontend Development - Complete AI Prompt

## Project Context
You are developing the **Admin Module frontend** for the **UniXsport - University Smart Gym & Sports Equipment Management System**. This is a complete frontend-only implementation using **pure HTML, CSS, and JavaScript** (no frameworks). The system already has Student, Storekeeper, and Coach modules. The Admin module should match the existing design system (sporty theme with blue, green, orange accent colors).

## Design System Reference
- **Colors**: Blue (#2563eb), Green (#16a34a), Orange (#ea580c)
- **Fonts**: Outfit (body), Space Grotesk (headings)
- **Icons**: Font Awesome 6.5.1
- **Layout**: Sidebar navigation + top navbar (same as other modules)
- **Responsive**: Desktop, tablet, mobile (collapsible sidebar on mobile)

---

## 1. ADMIN DASHBOARD PAGE

### Overview Cards (Top Section)
Create 4-5 cards displaying:
- **Total Students** (with icon: fa-users)
- **Total Coaches** (with icon: fa-user-tie)
- **Total Equipment** (with icon: fa-boxes-stacked)
- **Equipment Status Breakdown** (3 mini cards or single card with 3 sections):
  - Available (green badge)
  - Borrowed (orange badge)
  - Damaged (red badge)

Each card should:
- Have hover effects
- Be clickable (navigate to relevant page)
- Show numbers dynamically (use sample data)
- Use gradient backgrounds matching the sporty theme

### Quick Links Section
Create button cards for:
- **User Management** → navigates to user management page
- **Equipment Management** → navigates to equipment page
- **Notices & Broadcasts** → navigates to notices page
- **Admin Profile** → navigates to profile page

### Recent Activity / Notices Board
Display recent notices/broadcasts as cards:
- Title
- Message preview
- Created date
- "View All" link

### Optional: Statistics Chart
If possible, add a simple bar chart or pie chart showing:
- Equipment status distribution
- Or student/coach ratio

---

## 2. EQUIPMENT MANAGEMENT PAGE

### Page Header
- Title: "Equipment & Sports Room Management"
- "Add Equipment" button (primary, with icon)

### Filters & Search
- **Search bar** (with icon): Search by equipment name
- **Filter dropdown**: Filter by status (All, Available, Borrowed, Damaged)
- **Filter dropdown**: Filter by Sports Room (All Rooms, Room 1, Room 2, etc.)

### Equipment Table
Create a responsive table with columns:
- **Equipment Name** (bold)
- **Quantity** (total)
- **Available** (number available)
- **Status** (color-coded badge: green=available, orange=borrowed, red=damaged)
- **Sports Room** (room name)
- **Actions** (Edit button, Delete button)

Table features:
- Hover effects on rows
- Responsive (scrollable on mobile)
- Empty state message if no equipment

### Add Equipment Modal
Modal form with fields:
- **Equipment Name** (text input, required)
- **Total Quantity** (number input, required, min: 1)
- **Status** (dropdown: Available, Borrowed, Damaged, required)
- **Sports Room** (dropdown with room options, required)
- **Description** (textarea, optional)
- Buttons: "Add Equipment" (primary), "Cancel" (outline)

### Edit Equipment Modal
Same as Add modal but:
- Pre-filled with existing data
- Title: "Edit Equipment"
- Button: "Update Equipment"

### Delete Confirmation Modal
- Message: "Are you sure you want to delete [Equipment Name]?"
- Warning icon
- Buttons: "Delete" (danger/red), "Cancel"

---

## 3. USER MANAGEMENT PAGE

### Page Header
- Title: "User Management"
- "Add User" button (primary, with icon)

### Tabs
Two tabs: **Students** | **Coaches**
- Active tab highlighted
- Clicking tab switches table content

### User Table
Columns:
- **Name** (bold)
- **Email**
- **Role** (badge: Student/Coach)
- **RFID Code** (if available, show; else "-")
- **Status** (Active/Inactive badge, optional)
- **Actions** (Edit button, Delete button)

Table features:
- Search bar (search by name or email)
- Filter by role (if needed)
- Responsive design
- Empty state message

### Add User Modal
Form fields:
- **Name** (text input, required)
- **Email** (email input, required)
- **Password** (password input, required, min 6 chars)
- **Role** (dropdown: Student, Coach, required)
- **RFID Code** (text input, optional)
- **Status** (dropdown: Active, Inactive, default: Active)
- Buttons: "Add User" (primary), "Cancel"

### Edit User Modal
Same as Add but:
- Pre-filled data
- Password field optional (only if changing)
- Title: "Edit User"
- Button: "Update User"

### Delete Confirmation Modal
- Message: "Are you sure you want to delete user [Name]?"
- Warning about data loss
- Buttons: "Delete" (danger), "Cancel"

---

## 4. NOTICES / BROADCAST MESSAGES PAGE

### Page Header
- Title: "Notices & Broadcast Messages"
- "Create Notice" button (primary, with icon)

### Create Notice Form
Full-page form or modal with:
- **Title** (text input, required)
- **Message** (textarea, required, rows: 5-6)
- **Visible To** (dropdown: All Users, Students Only, Coaches Only, required)
- **Priority** (dropdown: Normal, High, Urgent, optional)
- **Schedule** (optional: checkbox "Schedule for later" + date/time picker)
- Buttons: "Publish Notice" (primary), "Save Draft" (outline), "Cancel"

### Notices List/Table
Display all notices with:
- **Title** (bold, clickable to expand)
- **Message** (preview, expandable)
- **Created By** (Admin name)
- **Created Date** (formatted date/time)
- **Visible To** (badge: All/Students/Coaches)
- **Priority** (badge if high/urgent)
- **Status** (Published/Draft badge)
- **Actions** (Edit, Delete, Archive buttons)

Display as:
- Cards (preferred) or table
- Most recent first
- Color-code by priority (urgent = red border, high = orange, normal = default)

### Edit Notice Modal
Same form as Create but pre-filled

### Delete/Archive Confirmation
- Confirmation message
- Option to archive instead of delete

---

## 5. ADMIN PROFILE PAGE

### Profile Display Section
Card showing:
- **Profile Picture** (circular, large, with upload button overlay)
- **Name** (large, bold)
- **Email**
- **Role**: Admin (badge)
- **Member Since**: Date
- **Last Login**: Date/time

### Edit Profile Modal
Form fields:
- **Name** (text input)
- **Email** (email input)
- **Profile Picture** (file upload, image only)
- **Phone** (optional)
- Buttons: "Save Changes" (primary), "Cancel"

### Change Password Modal
Form fields:
- **Current Password** (password input, required)
- **New Password** (password input, required, min 6 chars)
- **Confirm New Password** (password input, required)
- Password strength indicator (optional)
- Buttons: "Change Password" (primary), "Cancel"

---

## 6. NAVIGATION STRUCTURE

### Sidebar Menu
- Dashboard (active by default)
- User Management
- Equipment Management
- Notices & Broadcasts
- Admin Profile
- Logout

### Top Navbar
- Logo: "UniXsport Admin"
- Admin name display
- Notifications icon (with badge count)
- Logout button

---

## 7. STYLING REQUIREMENTS

### Colors
- **Primary**: Blue (#2563eb) - buttons, links
- **Success**: Green (#16a34a) - available status, success messages
- **Warning**: Orange (#ea580c) - borrowed status, warnings
- **Danger**: Red (#dc2626) - damaged status, delete actions
- **Neutral**: Gray scale for backgrounds, borders

### Components
- **Cards**: White background, rounded corners (12px), shadow
- **Buttons**: Rounded (12px), hover effects (lift + shadow)
- **Badges**: Rounded pills (20px), color-coded
- **Modals**: Centered, backdrop blur, smooth animations
- **Tables**: Striped rows on hover, clean borders
- **Forms**: Clean inputs with focus states, error messages

### Responsive Design
- **Desktop**: Full sidebar, multi-column layouts
- **Tablet**: Collapsible sidebar, 2-column grids
- **Mobile**: Hamburger menu, single column, stacked cards

### Animations
- Fade-in for page transitions
- Smooth hover effects
- Modal slide-in animations
- Toast notifications slide-in

---

## 8. SAMPLE DATA STRUCTURE

Use this sample data structure (simulated in JavaScript):

```javascript
// Sample Users
let users = [
    { id: 1, name: 'John Doe', email: 'john@student.edu', role: 'student', rfidCode: 'STU001', status: 'active' },
    { id: 2, name: 'Coach Mike', email: 'mike@coach.edu', role: 'coach', rfidCode: 'COACH001', status: 'active' }
];

// Sample Equipment
let equipment = [
    { id: 1, name: 'Dumbbells (5kg)', quantity: 20, available: 15, status: 'available', room: 'Room A', borrowed: 5, damaged: 0 },
    { id: 2, name: 'Basketballs', quantity: 15, available: 3, status: 'borrowed', room: 'Room B', borrowed: 10, damaged: 2 }
];

// Sample Notices
let notices = [
    { id: 1, title: 'Gym Maintenance', message: 'Gym will be closed on...', createdBy: 'Admin', createdAt: '2025-02-19', visibleTo: 'all', priority: 'high' }
];

// Sample Sports Rooms
let sportsRooms = [
    { id: 1, name: 'Main Gym Hall', location: 'Building A, Floor 1' },
    { id: 2, name: 'Sports Room B', location: 'Building B, Floor 2' }
];
```

---

## 9. FUNCTIONALITY REQUIREMENTS

### Dashboard
- Calculate totals from sample data
- Display equipment status breakdown
- Show recent notices (last 3-5)
- Quick navigation to other pages

### Equipment Management
- Display all equipment in table
- Filter by status and room
- Search by name
- Add/Edit/Delete modals (simulate API calls with alerts)
- Update table after add/edit/delete

### User Management
- Switch between Students and Coaches tabs
- Display users in table
- Search functionality
- Add/Edit/Delete modals
- Form validation (email format, password strength)

### Notices
- Create notice form
- Display notices list
- Edit/Delete notices
- Filter by visibleTo and priority
- Display on dashboard

### Admin Profile
- Display profile info
- Edit profile modal
- Change password modal
- Profile picture upload (preview)

---

## 10. TECHNICAL REQUIREMENTS

### File Structure
```
admin.html          # Main HTML file (all pages as sections)
css/admin.css       # All styles
js/admin.js         # All JavaScript logic
```

### JavaScript Functions Needed
- Navigation between pages
- Modal open/close handlers
- Form validation
- Table rendering
- Filter/search logic
- Data CRUD simulation (localStorage or in-memory)
- Toast notifications (optional)

### Form Validation
- Required fields
- Email format validation
- Password strength (min 6 chars)
- Number inputs (quantity > 0)
- File upload validation (image types, size limits)

### Error Handling
- Show error messages for invalid inputs
- Confirmation dialogs for delete actions
- Success messages after actions

---

## 11. OPTIONAL ENHANCEMENTS

- **Charts**: Use Chart.js or similar for dashboard statistics
- **Toast Notifications**: Show success/error messages
- **Export Functionality**: Export equipment/user lists (simulated)
- **Activity Logs Page**: Display system activity (if time permits)
- **Bulk Actions**: Select multiple items for bulk delete
- **Advanced Filters**: Date range, multiple status filters
- **Pagination**: For large tables (if > 10 items)

---

## 12. DELIVERABLES

Create:
1. **admin.html** - Complete HTML with all pages, modals, forms
2. **css/admin.css** - Complete responsive stylesheet
3. **js/admin.js** - Complete JavaScript with all functionality

All code should be:
- Well-commented
- Clean and maintainable
- Responsive
- Matching the existing UniXsport design system
- Ready for backend API integration (use placeholder functions)

---

## 13. SPECIFIC INSTRUCTIONS FOR AI

1. **Use the same design system** as the existing modules (check storekeeper.html and coach.html for reference)
2. **Create all pages in a single HTML file** using page sections (like other modules)
3. **Use Font Awesome icons** throughout
4. **Implement full CRUD** with modals and confirmations
5. **Add sample data** in JavaScript for demonstration
6. **Make it fully responsive** with mobile menu
7. **Include form validation** and error messages
8. **Use consistent naming** (admin.html, admin.css, admin.js)
9. **Add comments** explaining key functionality
10. **Ensure accessibility** (aria-labels, semantic HTML)

---

## FINAL NOTES

This is a **frontend-only** implementation. Backend API calls should be simulated with:
- `setTimeout()` to simulate API delays
- `alert()` or console.log for success/error messages
- In-memory data storage (JavaScript arrays) or localStorage
- Placeholder functions like `createUser()`, `updateEquipment()`, etc.

The goal is to create a **complete, polished, production-ready frontend** that can be easily integrated with a backend API later.

---

**Ready to generate code? Start with admin.html, then admin.css, then admin.js. Ensure all components are functional and match the design system!**
