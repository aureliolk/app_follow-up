# Active Context

## Current Work
- Implementing AI service integration
- Setting up database schema
- Developing API endpoints
- Building UI components
- **Refactoring and streamlining real-time notification system (Pusher)**
- **Fixing 'NOVO CONTATO' issue in conversation list**

## Recent Changes
- Added AI model selector
- Implemented Redis for real-time updates
- Set up Prisma ORM
- Created base UI components
- **Centralized Pusher event triggering into a helper function (`lib/pusherEvents.ts`)**
- **Standardized Pusher event payloads for message status updates**
- **Ensured correct client name propagation for new conversations in real-time**
- **Resolved Pusher 413 error by removing base64 from payload**

## Next Steps
- Implement authentication
- Build conversation service
- Add real-time messaging
- Create admin dashboard
- **Test real-time message status updates thoroughly**

## Challenges
- AI model integration complexity
- Real-time sync between services
- Performance optimization
- Security considerations
- **Debugging inconsistent real-time message status updates**
- **Ensuring correct data propagation for optimistic UI updates**

## Decisions
- Using Redis for pub/sub
- Prisma for database access
- Next.js API routes for backend
- React for frontend
- **Using Pusher for real-time communication**
- **Implemented a centralized Pusher event helper for consistency**
