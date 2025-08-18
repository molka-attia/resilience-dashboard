# Resilience Dashboard

## Overview

The **Resilience Dashboard** is a powerful monitoring and analysis platform designed to evaluate the performance and fault tolerance of microservices running on Kubernetes. It collects system metrics, tracks events, and provides interactive visualizations to help engineers understand system behavior under both normal and fault-injected conditions.

## Features

### Monitoring & Metrics
- **Real-time Monitoring**: Track CPU, memory, and network usage across microservices in real time.
- **Prometheus Integration**: Seamlessly collect system and application-level KPIs using Prometheus.
- **Metric Visualization by Date**: Analyze system behavior before, during, and after incidents or fault injections by selecting specific time windows.

### Fault Injection
Test system resilience by injecting controlled failures into Kubernetes workloads:
- Network delay (via Istio)
- Network packet loss
- CPU stress
- Memory stress

### Event Tracking
Automatically log pod and service events with detailed metadata, including:
- Timestamps
- Fault type
- System state changes
- Pod name, namespace, and node name
- Reason, message, and phase
- Host IP and Pod IP

### Advanced Visualizations
- **Service Dependency Graphs**: Visualize relationships and dependencies between microservices.
- **Monitoring Knowledge Graph**: Explore connections between services, pods, and KPIs through an interactive, clickable graph that reveals related metrics and dependencies.
- **Dashboards & Charts**: Access a user-friendly web interface featuring tables and plots for quick insights.

### Data & Analytics
- **Resilience Score Calculation**:
  - Calculated based on error rate, latency, and availability.
  - Utilizes normalized, weighted, and aggregated KPIs.
  - Provides a structured measure of system robustness before, during, and after faults.
- **Data Export**: Export KPIs, event logs, and resilience scores in structured formats (e.g., CSV, JSON) for further analysis.

## Getting Started

### Prerequisites and Tool Installation
Before running the Resilience Dashboard and conducting fault injection experiments, ensure the following prerequisites and tools are properly set up in your Kubernetes environment. These are essential for simulating realistic failure conditions and enabling meaningful resilience analysis.

- **Node.js** and **npm**: Required for running the dashboard application.
- **Kubernetes Cluster**: Access to a Kubernetes cluster with **Prometheus** installed for metrics collection.
- **stress-ng**: Used to generate CPU and memory stress for fault injection.
- **tc (traffic control)**: Required to introduce network delay, jitter, or packet loss.
- **Istio**: Must be properly configured to simulate Istio-specific network delays.

> **⚠️ Note**: Ensure that cluster nodes allow execution of these tools and that you have sufficient privileges to apply them

### Video Demo
Watch a demo of the Resilience Dashboard in action to see how it monitors and visualizes microservice performance under fault conditions.  
[Download Demo Video](https://github.com/molka-attia/resilience-dashboard/releases/download/v1.0.0/demo-video.mp4)

