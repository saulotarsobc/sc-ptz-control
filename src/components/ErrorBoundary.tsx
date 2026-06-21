import { Alert, Button, Container, Stack, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container size="sm" py="xl">
          <Stack align="center" gap="md">
            <IconAlertTriangle size={48} color="var(--mantine-color-red-5)" />
            <Title order={3}>Algo deu errado</Title>
            <Alert color="red" title={this.state.error?.name} w="100%">
              {this.state.error?.message}
            </Alert>
            <Button
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Tentar novamente
            </Button>
          </Stack>
        </Container>
      );
    }
    return this.props.children;
  }
}
