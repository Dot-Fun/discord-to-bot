# Testing Guide

## Overview

This project includes a comprehensive test suite for the session management functionality with 100% code coverage for the SessionManager module.

## Test Structure

### 1. Unit Tests (`tests/session-manager.test.js`)
- Tests core SessionManager functionality in isolation
- Uses mocked file system to avoid real I/O
- Covers all methods and edge cases
- **Coverage**: 100% for SessionManager

### 2. Coverage Tests (`tests/session-coverage.test.js`)
- Additional tests to ensure complete code coverage
- Tests all branches and error conditions
- Validates edge cases and error handling

### 3. Integration Tests (`tests/session-integration.test.js`)
- Tests session management within Discord bot context
- Uses test utilities for mocking Discord.js
- Validates real-world usage scenarios

### 4. Test Utilities (`tests/test-utils.js`)
- Helper functions for creating mock Discord objects
- Standardized test setup for Discord bot testing

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm test:coverage

# Run unit tests only
npm test:unit

# Run integration tests only
npm test:integration

# Watch mode for development
npm test:watch

# Verbose output with coverage
npm test:verbose
```

## Coverage Requirements

The project is configured with 90% coverage thresholds for:
- Statements
- Branches
- Functions
- Lines

Current SessionManager coverage: **100%**

## Test Features

### Session Management Tests
✅ Session creation and storage
✅ Session loading from disk
✅ Session validation (UUID format, age)
✅ Session cleanup (old sessions)
✅ Channel isolation
✅ Error handling and recovery
✅ File system error handling
✅ Edge cases (corrupted data, missing files)

### Mock Capabilities
- File system operations (fs module)
- Discord.js client and objects
- Claude AI SDK responses
- Environment variables

## Best Practices

1. **Isolation**: Each test is independent and doesn't affect others
2. **Mocking**: External dependencies are mocked to ensure predictable tests
3. **Coverage**: Aim for high coverage but focus on meaningful tests
4. **Speed**: Tests run quickly by avoiding real I/O and network calls
5. **Clarity**: Test names clearly describe what they're testing

## Adding New Tests

When adding new features:
1. Write unit tests for new functions/methods
2. Add integration tests for Discord bot interactions
3. Ensure coverage remains above 90%
4. Update this guide with new test scenarios

## CI/CD Integration

Tests can be integrated into CI/CD pipelines:
```yaml
# Example GitHub Actions
- name: Run tests
  run: npm test:coverage
```

## Debugging Tests

For failing tests:
1. Run specific test: `npm test -- --testNamePattern="test name"`
2. Add console.logs (will show in test output)
3. Use debugger: `node --inspect-brk node_modules/.bin/jest`
4. Check mock implementations match expected behavior