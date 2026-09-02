<!-- fuente: https://developer.uber.com/docs/eats/guides/getting-started -->
## Getting Started

**Access to These APIs May Require Written Approval From Uber**

Uber’s APIs are always under development and as such are subject to changes according to our Versioning & Upgrade policy. As part of Uber’s ongoing privacy improvements, we’ve updated our Developer API program with new scope access policies for third party applications. For further information, please refer to our Getting Started guide in the navigation panel.

This guide covers the essential concepts and initial setup for building an Uber Eats Marketplace API integration. For additional use-cases outside of order fulfillment, please ensure you have an aligned business agreement with Uber ahead of beginning development.

#### Overview

Uber Eats integrations connect your system or platform with Uber Eats for:

-   **Store Management** - Online/offline status, hours, settings
-   **Menu Synchronization** - Items, pricing, availability, categories
-   **Order Processing** - Receiving, accepting, and fulfilling orders

#### Prerequisites

Before beginning development:

-   **Developer Account** - Start with a Sandbox applications, see [Sandbox & Testing](sandbox) for detailed environment configuration.
-   **Legal Requirements** - Complete NDA and API licensing agreement
-   **Partner Approval** - Speak with your Uber Eats partner manager

#### Core Integration Areas

Your Uber Eats integration handles four essential areas. Each area has both conceptual foundations and specific implementation requirements:

#### 1. Authentication & Authorization

**What it does:** Secures all API access using OAuth 2.0 with scoped permissions.

**How it works:**

1.  Exchange client credentials for access tokens (30-day expiration)
2.  Include bearer tokens in all API request headers
3.  Use separate credentials for test vs production environments

→ **Implementation guide**: [Authentication](authentication)

#### 2. Store Management

**What it does:** Stores are merchant locations that receive orders and define your integration’s operational foundation.

**Key capabilities:**

-   **Status Control** - Toggle stores online/offline programmatically
-   **Hours Management** - Set regular hours and holiday schedules
-   **Configuration** - Store-specific settings and operational parameters

**How it works:** Each store represents a merchant location that can receive orders. Your integration controls when stores appear available to customers and manages their operational parameters.

→ **Implementation guide**: [Store Integration](store-integration)

#### 3. Menu Synchronization

**What it does:** Menus define what customers can order using a hierarchical structure: Categories → Items → Modifiers.

**Key capabilities:**

-   **Full Menu Upload** - Complete menu replacement via PUT requests
-   **Partial Updates** - Update specific items, pricing, or availability
-   **Real-time Changes** - Inventory updates, seasonal items, price changes

**How it works:** Your system uploads and maintains menu structures that customers see in the Uber Eats app. Changes propagate to customers in real-time, enabling dynamic pricing and availability management.

→ **Implementation guide**: [Menu Integration](menu-integration)

#### 4. Order Processing

**What it does:** Orders flow from customers through Uber Eats to your integration via webhooks for the complete fulfillment lifecycle.

**Key capabilities:**

-   **Order Reception** - Receive new orders via webhook notifications
-   **Order Management** - Accept, deny, or modify orders as needed
-   **Status Updates** - Communicate preparation and delivery status
-   **BYOC Support** - Bring Your Own Courier for delivery management

**How it works:** Customers place orders through Uber Eats, triggering webhooks to your system. Your integration handles the complete order lifecycle from acceptance through fulfillment.

→ **Implementation guide**: [Order Integration](order-integration)

* * *

#### Testing Your Integration

**Environment Setup**

1.  Create a TESTING application for safe development
2.  Use sandbox domains (`test-api.uber.com`, `sandbox-auth.uber.com`)
3.  Test with simulated stores and orders - no real merchant impact

**Validation Steps**

-   **Authentication** - Verify token generation and API access
-   **Store Operations** - Test status changes and configuration
-   **Menu Management** - Upload menus and verify consumer visibility
-   **Order Handling** - Receive webhooks and process order lifecycle

→ **Technical setup details**: [Sandbox & Testing](sandbox)

* * *

#### Development Resources

#### Essential Tools

| Tool | Purpose | Use Case |
| --- | --- | --- |
| [Developer Dashboard](https://developer.uber.com/dashboard) | Application management | Create apps, manage credentials, configure scopes |
| [Postman Collection](https://www.postman.com/uber) | API testing | Pre-built requests for all endpoints |
| [Webhook Testing Tools](webhooks) | Webhook development | Local tunnel setup, payload validation |

#### Documentation Resources

**Implementation Guides**

-   [Store Integration](store-integration) - Merchant onboarding and management
-   [Menu Integration](menu-integration) - Menu structure and synchronization
-   [Order Integration](order-integration) - Order processing and fulfillment
-   [Authentication](authentication) - OAuth 2.0 implementation details

**Technical References**

-   [Sandbox & Testing](sandbox) - Environment configuration and troubleshooting
-   [Going Live Guide](going-live) - Production launch requirements

#### Support Channels

**Technical Support**

-   [Integration Tech Support](http://t.uber.com/integration-support) - Technical questions and issues
-   [API Change Log](../api-change-log) - Stay current with platform updates
-   [Quality & Performance Standards](../quality-and-performance) - Performance requirements and best practices

#### Next Steps

Now that you understand the core concepts, choose your path forward:

#### For Hands-On Development

**Start Building Immediately**

-   [Sandbox & Testing](sandbox) - Set up your development environment
-   [Authentication](authentication) - Implement OAuth 2.0 flow
-   [Store Integration](integration-activation-flows) - Connect your first merchant location

#### For Project Planning

**Plan Your Integration Timeline**

-   [Quality & Performance Standards](../quality-and-performance) - Performance requirements and best practices
-   [Going Live Guide](going-live) - Production launch requirements

#### For Technical Deep Dives

**Understand Complex Scenarios**

-   [Menu Integration](menu-integration) - Complex menu structures and updates
-   [Order Integration](order-integration) - Advanced order processing workflows
-   [Webhooks Guide](webhooks) - Reliable event handling and retry logic

* * *

**You’re Ready To:**

-   Create your first sandbox application
-   Understand the integration architecture
-   Navigate to the right technical guides for implementation
-   Plan your integration project timeline with your Uber Business and Technical Representatives

**Need Help?** Use [Integration Tech Support](http://t.uber.com/integration-support) for technical questions or guidance on your specific use case.

[

Overview

](#overview)[

Prerequisites

](#prerequisites)[

Core Integration Areas

](#core-integration-areas)[

1\. Authentication & Authorization

](#1.-authentication-&-authorization)[

2\. Store Management

](#2.-store-management)[

3\. Menu Synchronization

](#3.-menu-synchronization)[

4\. Order Processing

](#4.-order-processing)[

Testing Your Integration

](#testing-your-integration)[

Development Resources

](#development-resources)[

Essential Tools

](#essential-tools)[

Documentation Resources

](#documentation-resources)[

Support Channels

](#support-channels)[

Next Steps

](#next-steps)[

For Hands-On Development

](#for-hands-on-development)[

For Project Planning

](#for-project-planning)[

For Technical Deep Dives

](#for-technical-deep-dives)
