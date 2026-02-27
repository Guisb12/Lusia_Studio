export type ToolCallState = {
  started?: boolean;
  name?: string;
  args?: any;
  result?: string;
  final?: boolean;
  finalArgs?: string;
};

export type ToolRendererProps = {
  call: ToolCallState;
};

export type ToolRenderer = React.ComponentType<ToolRendererProps>;
