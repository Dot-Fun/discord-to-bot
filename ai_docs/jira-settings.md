# DotFun JIRA Instance Settings

## Instance Information

- **Instance URL**: [TO BE CONFIGURED]
- **Cloud ID**: [Use getAccessibleAtlassianResources to retrieve]
- **Site Name**: DotFun
- **Created**: [TO BE DETERMINED]
- **Plan Type**: [Standard/Premium/Enterprise]
- **User License Count**: [TO BE DETERMINED]

## Project Structure

### Active Projects

#### Project Details Template
- **Project Key**: [PROJECT_KEY]
- **Project Name**: [Full Project Name]
- **Project ID**: [Numeric ID]
- **Project Type**: [Software/Business/Service Management]
- **Lead**: [Project Lead Account ID]
- **Issue Types**: Story, Task, Bug, Epic, Subtask

### Known Projects
[To be populated by running getVisibleJiraProjects]

## Issue Type Configuration

### Standard Issue Types

#### Epic
- **ID**: [TO BE DETERMINED]
- **Description**: Large body of work that can be broken down into stories
- **Fields**: Epic Name, Epic Color, Epic Status

#### Story
- **ID**: [TO BE DETERMINED]
- **Description**: Functionality that delivers value to end user
- **Fields**: Story Points, Sprint, Epic Link

#### Task
- **ID**: [TO BE DETERMINED]
- **Description**: Work item that needs to be completed
- **Fields**: Time Tracking, Sprint, Parent Issue

#### Bug
- **ID**: [TO BE DETERMINED]
- **Description**: Problem or error that needs to be fixed
- **Fields**: Priority, Severity, Affected Version

#### Subtask
- **ID**: [TO BE DETERMINED]
- **Description**: Smaller piece of work within a parent issue
- **Fields**: Parent Issue, Time Tracking

## Custom Fields

### Story Points Field
- **Field ID**: [TO BE DETERMINED via MCP]
- **Field Name**: Story Points
- **Type**: Number
- **Context**: All Software Projects
- **Usage**: 1 point = 1 hour of work

### Sprint Field
- **Field ID**: customfield_10020 (typical)
- **Field Name**: Sprint
- **Type**: Sprint Picker

### Epic Link Field
- **Field ID**: customfield_10014 (typical)
- **Field Name**: Epic Link
- **Type**: Epic Link

## Workflow States

### Standard Workflow
1. **Backlog** - Issue created but not ready to work
2. **Ready** - Issue refined and ready for sprint
3. **In Progress** - Active development
4. **In Review** - Code review/QA
5. **Done** - Work completed

### Transitions
- **Start Work**: Backlog/Ready → In Progress
- **Submit for Review**: In Progress → In Review
- **Complete**: In Review → Done
- **Reopen**: Done → In Progress

## Board Configuration

### Sprint Board Settings
- **Board Type**: Scrum
- **Estimation**: Story Points
- **Sprint Duration**: 2 weeks
- **Working Days**: Monday - Friday

### Swimlanes
- **Configuration**: By Assignee
- **Default Swimlane**: Unassigned Issues

### Quick Filters
- **My Issues**: assignee = currentUser()
- **Current Sprint**: sprint in openSprints()
- **Bugs**: issuetype = Bug
- **Blocked**: status = Blocked

## JQL Queries

### Useful Queries

#### Current Sprint Work
```
project = [PROJECT_KEY] AND sprint in openSprints() ORDER BY priority DESC, created ASC
```

#### My Open Issues
```
assignee = currentUser() AND resolution = Unresolved ORDER BY priority DESC
```

#### Recently Updated
```
updated >= -7d ORDER BY updated DESC
```

#### Unestimated Stories
```
issuetype = Story AND "Story Points" is EMPTY AND status != Done
```

#### Sprint Velocity
```
project = [PROJECT_KEY] AND issuetype in (Story, Bug) AND resolutiondate >= -14d
```

## Integration Settings

### GitHub Integration
- **Repository Links**: Enabled
- **Smart Commits**: Enabled
- **Pull Request Integration**: Enabled
- **Commit Pattern**: [PROJECT_KEY]-[ISSUE_NUMBER]

### Confluence Integration
- **Space Linking**: Enabled
- **Page Templates**: Sprint Reports, Release Notes
- **Documentation Sync**: Bi-directional

### Discord Integration
- **Webhook Channels**: 
  - `#jira-updates` - All issue updates
  - `#jira-tickets` - New ticket creation
- **Bot User**: dotfun-2jiraticket
- **Notifications**: Create, Update, Transition, Comment

## Permissions Scheme

### Project Permissions
- **Browse Projects**: All logged-in users
- **Create Issues**: Project members
- **Edit Issues**: Reporter and Assignee
- **Delete Issues**: Project administrators
- **Manage Sprints**: Scrum Master role

### Issue Security
- **Default Level**: Project members only
- **Sensitive Issues**: Restricted to specific roles

## Automation Rules

### Common Automations
1. **Auto-assign to Creator**: When issue created → Assign to reporter
2. **Sprint Completion**: When sprint ends → Move incomplete issues to next sprint
3. **Story Point Reminder**: When story created → Comment if no story points after 2 days
4. **PR Link Detection**: When PR mentioned → Add development info

## Quick Reference

### Most Used JQL Filters
- **Current Sprint**: `sprint in openSprints()`
- **My Work**: `assignee = currentUser() AND resolution = Unresolved`
- **Needs Estimation**: `"Story Points" is EMPTY`
- **In Review**: `status = "In Review"`
- **Recently Resolved**: `resolved >= -7d`

### API Endpoints (via MCP)
- **Get Issue**: getJiraIssue
- **Create Issue**: createJiraIssue
- **Update Issue**: editJiraIssue
- **Transition Issue**: transitionJiraIssue
- **Search Issues**: searchJiraIssuesUsingJql

## Usage Notes

- Always use MCP tools for JIRA operations rather than direct API calls
- Story points follow 1 point = 1 hour convention
- Use conventional commit messages with JIRA issue keys
- Sprint planning happens bi-weekly
- All code changes should reference a JIRA issue

## Configuration TODO

1. Run `getAccessibleAtlassianResources` to get Cloud ID
2. Run `getVisibleJiraProjects` to list all projects
3. Use `getJiraProjectIssueTypesMetadata` to get issue type IDs
4. Find custom field IDs for Story Points using Atlassian MCP
5. Update this document with actual values