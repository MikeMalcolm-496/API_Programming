Team Information
-----------------------------------------
Team No: Team 10
Team Members:
    Judy Nafula: Integration/QA Lead
    Almah Namarome: Docs/DevOps
    Michael Gathungu: API Lead
    Mike Malcolm: Backend Dev
-----------------------------------------
Project Information
This is a Lost & Found platform for Strathmore University — a web app that connects security staff (who find items) with students (who lost them).
How it works:
Security staff find an item on campus, log in, and post it to the platform — title, category, location found, date, description, and photos.
Anyone can browse the public list of found items and filter by category or status (unclaimed, under review, claimed, closed).
If a student recognizes something as theirs, they log in and submit a claim on that item, describing why it's theirs.
Security staff review incoming claims, and can message back and forth with the claimant to verify ownership before approving or rejecting the claim.
Once approved, the item's status gets updated and the case is resolved.
--------------------------------------------------
1. Database Structure
The application will utilize a database consisting of 5 tables:
    Inquiry-messages
    Found-item-images
    Inquiries
    Found_Items
    Users

2. User Roles and Functionality
A. General Features (Accessible to Everyone)
    Browse Items: View a list of all found items.
    Filtering: Refine the item list by category or current status.
    Details: View the detailed page for any specific item.

B. Student Role
    Account Management: Register, Log in, and Log out of the system.
    Claim Process: Submit a claim/inquiry regarding a specific found item.
    Messaging: Send and receive messages (presumably regarding claims).
    Dashboard: View a personal list of "My Claims" on their dashboard.

C. Security / Admin Role
    Account Management: Register (with an admin role), Log in, and Log out.
    Posting Items: Add new found items to the system, including uploading images.
    Item Management: View a personal list of "My Posted Items." Note: While the notes reference "My Posted Items", this is a dashboard view for Admins/Security to manage the items they have entered.
    Claims & Inquiries:
    Review claims and inquiries submitted by students.
    Action: Approve or reject claims.
    Communication: Message claimants regarding their requests.
    Status Updates: Update the status of items in the system.
----------------------------
Ring Position
    Team 10 working with both TEAM 9 and TEAM 11. We shall be creating an API for Team 11 and shall be consuming the API from team 9.